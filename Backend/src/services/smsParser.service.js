const crypto = require('crypto');
const SmsLog = require('../models/SmsLog');
const DeliverySchedule = require('../models/DeliverySchedule');
const { safeLog } = require('../utils/logger');
const { env } = require('../config/env');
const ollamaDeliveryExtractorService = require('./ollamaDeliveryExtractor.service');

const COMPANY_MATCHERS = [
  ['dvaarikart', [/\bdvaarikart\b/i]],
  ['ekart', [/\bekart\b/i, /\bekm\b/i]],
  ['xpressbees', [/\bxpressbees\b/i, /\bxb rider\b/i]],
  ['shadowfax', [/\bshadowfax\b/i]],
  ['blitz', [/\bblitz\b/i, /\bbblitz\b/i]],
  ['savana', [/\bsavana\b/i]],
  ['amazon', [/\bamazon\b/i, /\bamazon pay\b/i]],
  ['flipkart', [/\bflipkart\b/i]],
  ['myntra', [/\bmyntra\b/i]],
  ['ajio', [/\bajio\b/i]],
  ['tira', [/\btira\b/i, /\btira beauty\b/i]],
  ['nykaa', [/\bnykaa\b/i]],
  ['zara', [/\bzara\b/i]],
];

const DELIVERY_SIGNAL_REGEX = /\b(?:out for delivery|on the way|arriving soon|successfully delivered|has been delivered|rider|delivery code|open box delivery code|track your order|tracking id|shipment|courier|parcel|package|shipped|dispatched|will be delivered|live track|wish master|waiting at your address)\b/i;
const DELIVERY_CONTEXT_REGEX = /\b(?:order|shipment|courier|parcel|package|delivery|tracking|awb|rider|partner)\b/i;
const NON_DELIVERY_REGEX = /\b(?:login|signup|register|bank transfer|transaction|credited|debited|account\b|netbanking|upi|loan|wallet|balance|refund initiated)\b/i;
// OTPs from delivery companies can be 4-8 digits and are sometimes spaced like "123 456" or "12-34-56".
// We match a wide digit block only when it is preceded by an OTP keyword, then normalize to digits only.
const OTP_REGEX = /\b(?:otp|delivery code|open box delivery code)\b(?:\s*(?:is|:|-|for|to))?\s*([0-9][0-9\s-]{2,20}[0-9])\b/i;
const AWB_REGEX = /\bawb(?:\s*(?:no|number|id))?\s*[:#-]?\s*([A-Z0-9-]{6,})\b/i;
const TRACKING_REGEX = /\b(?:tracking(?: id)?|track(?:ing)?(?: id| no| number)?|shipment(?: id| no| number)|consignment(?: no| number)?|track id)\s*[:#-]?\s*([A-Z0-9-]{6,})\b/i;
const ORDER_REGEX = /\b(?:order(?: id| no| number)?|order#)\s*[:#-]?\s*([A-Z0-9-]{4,})\b/i;
const FALLBACK_REFERENCE_REGEX = /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/gi;
const TIME_REGEX = /\b(?:today\s+by|by|between|valid till|till|before)\s+([0-9:\sapmAPM-]{3,30})(?:\s+today)?/i;
const GENERIC_PATTERN_KEYWORDS = new Set([
  'otp',
  'accept',
  'today',
  'delivery',
  'order',
  'package',
  'shipment',
  'courier',
  'arriving soon',
  'on the way',
]);
const DATE_RANGE_REGEX = /\b(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]{1,2}\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/;

const PERSONAL_SENDER_REGEX = /^(?:\+?91)?[6-9]\d{9}$/;
const STATUS_PRIORITY = {
  unknown: 0,
  initiated: 1,
  arriving_soon: 2,
  out_for_delivery: 3,
  upon_arrival: 4,
  delivered: 5,
  failed: 5,
};

const GENERIC_PARTNER_LABELS = new Set([
  'delivery partner',
  'delivery agent',
  'agent',
  'partner',
  'rider',
  'executive',
  'wish master',
  'xpressbees',
  'shadowfax',
  'ekart',
  'blitz',
  'savana',
  'amazon',
  'flipkart',
  'myntra',
  'ajio',
  'nykaa',
  'tira',
  'zara',
  'dvaarikart',
  'grahnetra ai labs',
]);

function computeArrivedByTablet(schedule) {
  // Only tablet scan flow writes an "upon_arrival" statusHistory entry with smsId = null.
  const history = schedule?.statusHistory;
  if (!Array.isArray(history)) return false;
  return history.some((entry) => entry?.status === 'upon_arrival' && !entry?.smsId);
}

function clean(value) {
  return String(value || '')
    .replace(/\u200b/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[•]/g, ' ')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[#:\-\s]+|[#:\-\s]+$/g, '')
    .trim();
}

function sanitize(text) {
  return clean(String(text || ''))
    .replace(/order([A-Z0-9]{8,})/gi, 'order $1')
    .replace(/tracking id of the (?:delivery|order)\s*:\s*/gi, 'tracking id: ')
    .replace(/awb\s*:\s*/gi, 'AWB: ')
    .replace(/otp\s*[-:]\s*/gi, 'OTP: ')
    .replace(/([A-Z0-9]{8,})(has been|has shipped|has|is)\b/gi, '$1 $2');
}

function normalizeCompanyName(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/\s+/g, '_');
}

function tokenizeLabel(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeReferenceToken(value) {
  const token = clean(value).toUpperCase();
  if (!token || token.length < 6) return false;
  if (/\s/.test(token)) return false;
  if (!/[0-9]/.test(token)) return false;
  if (!/^[A-Z0-9-]+$/.test(token)) return false;
  if (/^(OTP|AWB|TRACK|TRACKING|ORDER|ID)$/.test(token)) return false;
  return true;
}

function isCompanyLikeLabel(value) {
  const normalized = tokenizeLabel(value);
  if (!normalized) return false;
  if (GENERIC_PARTNER_LABELS.has(normalized)) return true;
  return COMPANY_MATCHERS.some(([company, patterns]) => {
    if (tokenizeLabel(company) === normalized) return true;
    return patterns.some(pattern => pattern.test(normalized));
  });
}

function sanitizeReferenceCandidate(value) {
  const candidate = clean(value).toUpperCase();
  if (!candidate) return '';
  if (looksLikeReferenceToken(candidate)) return candidate;
  const inline = candidate.match(/\b([A-Z0-9-]{6,})\b/)?.[1] || '';
  return looksLikeReferenceToken(inline) ? inline : '';
}

function normalizeSenderToken(value) {
  return clean(value)
    .replace(/^[A-Z]{2,3}-/i, '')
    .replace(/-S$/i, '')
    .replace(/\b(?:update|updates|alerts|alert|service|services|team)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractKnownCompanyName(value) {
  const source = clean(value);
  if (!source) return null;

  const direct = normalizeCompanyName(source);
  if (COMPANY_MATCHERS.some(([company]) => company === direct)) {
    return direct;
  }

  const normalizedSource = source.toLowerCase();
  const aliasMatch = COMPANY_MATCHERS.find(([, patterns]) =>
    patterns.some(pattern => pattern.test(normalizedSource))
  );
  return aliasMatch?.[0] || null;
}

function detectCompanyFromSender(senderPhone) {
  const sender = normalizeSenderToken(senderPhone);
  if (!sender || PERSONAL_SENDER_REGEX.test(clean(senderPhone))) return null;

  for (const [company, patterns] of COMPANY_MATCHERS) {
    if (patterns.some(pattern => pattern.test(sender))) {
      return {
        company,
        confidence: 88,
        pattern: `sender_match_${company}`,
      };
    }
  }

  return null;
}

function getCompanyAliasPatterns(companyName) {
  const normalized = normalizeCompanyName(companyName);
  const matcher = COMPANY_MATCHERS.find(([company]) => company === normalized);
  if (matcher) return matcher[1];
  return [new RegExp(`\\b${normalized.replace(/_/g, '\\s+')}\\b`, 'i')];
}

function extractPrefixedCompany(text) {
  const body = sanitize(text);
  const prefix = clean(body.match(/^([A-Za-z][A-Za-z0-9 &.-]{2,40})\s*:/i)?.[1] || '');
  if (!prefix) return null;
  return extractKnownCompanyName(prefix);
}

function extractExplicitDeliveryPartnerCompany(text) {
  const body = sanitize(text);
  const partner = clean(
    body.match(/\bdelivery partner\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1] || ''
  );
  if (!partner) return null;
  return extractKnownCompanyName(partner);
}

function detectCompanyHeuristic(text) {
  const body = sanitize(text);
  const prefixedCompany = extractPrefixedCompany(body);
  const explicitPartnerCompany = extractExplicitDeliveryPartnerCompany(body);
  const referencePrefix =
    body.match(/\btracking id[:#-]?\s*(SF[A-Z0-9-]{6,})\b/i)?.[1] ||
    body.match(/\bawb[:#-]?\s*(XB[A-Z0-9-]{6,})\b/i)?.[1];
  const courierHint =
    body.match(/\bdelivered by\s+([A-Za-z]+)\b/i)?.[1] ||
    body.match(/\bvia\s+([A-Za-z]+)\b/i)?.[1] ||
    body.match(/\bdelivery partner\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1] ||
    body.match(/\bwith\s+(Blitz|Xpressbees|Shadowfax|Ekart|Savana|Dvaarikart)\b/i)?.[1];

  if (prefixedCompany) {
    return { company: prefixedCompany, confidence: 92, pattern: `heuristic_prefix_${prefixedCompany}` };
  }
  if (explicitPartnerCompany) {
    return { company: explicitPartnerCompany, confidence: 90, pattern: `heuristic_partner_${explicitPartnerCompany}` };
  }
  if (referencePrefix?.toUpperCase().startsWith('SF')) {
    return { company: 'shadowfax', confidence: 68, pattern: 'heuristic_reference_shadowfax' };
  }
  if (referencePrefix?.toUpperCase().startsWith('XB')) {
    return { company: 'xpressbees', confidence: 68, pattern: 'heuristic_reference_xpressbees' };
  }

  if (courierHint) {
    const normalizedHint = normalizeCompanyName(courierHint);
    if (COMPANY_MATCHERS.some(([company]) => company === normalizedHint)) {
      return { company: normalizedHint, confidence: 75, pattern: `heuristic_courier_${normalizedHint}` };
    }
  }

  for (const [company, patterns] of COMPANY_MATCHERS) {
    if (patterns.some(pattern => pattern.test(body))) {
      return { company, confidence: 60, pattern: `heuristic_company_${company}` };
    }
  }
  return { company: 'unknown', confidence: 0, pattern: null };
}

function hasDeliveryContext(text) {
  const body = sanitize(text);
  return DELIVERY_SIGNAL_REGEX.test(body) || DELIVERY_CONTEXT_REGEX.test(body);
}

function normalizeReferenceId(value) {
  const normalized = clean(value);
  if (!normalized || normalized.length < 6) return '';
  if (!/\d/.test(normalized)) return '';
  if (/\s/.test(normalized) && !/^[A-Z]{2,}\d[A-Z0-9-]*$/i.test(normalized)) return '';
  if (/^(is|the|your|order|track|tracking|awb|otp|today|from)$/i.test(normalized)) return '';
  if (/\b(?:awb|tracking|track id|order id|delivery|shipment)\b/i.test(normalized) && !/[0-9]/.test(normalized)) return '';
  if (/^otp[-:\s]?\d{4,8}$/i.test(normalized)) return '';
  if (/^[0-9]{4,8}$/.test(normalized)) return '';
  return normalized;
}

function normalizeOtpCode(value, smsText = '', awbNumber = '', referenceId = '') {
  const otp = clean(value).replace(/\D/g, '');
  if (!otp || otp.length < 4 || otp.length > 8) return '';
  if (otp === clean(awbNumber) || otp === clean(referenceId)) return '';
  if (!OTP_REGEX.test(sanitize(smsText))) return '';
  return otp;
}

function normalizeAwbNumber(value) {
  const awb = clean(value).toUpperCase();
  if (!awb || awb.length < 6) return '';
  if (/^(OTP|ORD)[-:]/i.test(awb)) return '';
  if (/^[0-9]{4,8}$/.test(awb)) return '';
  return awb;
}

function normalizeOrderHint(value, referenceId = '') {
  const orderId = clean(value).toUpperCase();
  if (!orderId || orderId.length < 4) return '';
  if (orderId === clean(referenceId).toUpperCase()) return '';
  if (/^(OTP|AWB|TRACK|TRACKING|UPDATE|YOUR|ORDER|PACKAGE|FROM)$/i.test(orderId)) return '';
  if (/^\d{4,8}$/.test(orderId)) return '';
  return orderId;
}

function normalizeHumanName(value) {
  const name = clean(value)
    .replace(/\b(?:your delivery agent|delivery agent|rider|executive|wish master|partner)\b/gi, '')
    .replace(/\bdelivery partner\s*:?/gi, '')
    .trim();
  if (!name || name.length < 3) return '';
  if (/\d/.test(name)) return '';
  if (!/[A-Za-z]/.test(name)) return '';
  if (isCompanyLikeLabel(name)) return '';
  return name;
}

function normalizeProductTitle(value) {
  const product = clean(value)
    .replace(/\b(?:tracking id|track id|track|awb|otp|delivery code|open box delivery code|order id|order no|order number)\b.*$/i, '')
    .replace(/\b(?:will be delivered|is now out for delivery|has been successfully delivered|has been delivered|is out for delivery|out for delivery|arriving soon|on the way)\b.*$/i, '')
    .replace(/^#?update[:\s-]*/i, '')
    .replace(/\b(?:ekart|xpressbees|shadowfax|blitz|amazon|myntra|ajio|flipkart|nykaa|savana)\s+update[:\s-]*/i, '')
    .replace(/\b(?:with\s+(?:tracking id|track id|tracking|awb|id)\s*[A-Z0-9-]+)\b/gi, '')
    .replace(/\b(?:tracking id|track id|awb|id)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, '')
    .replace(/\bOTP\s*[:#-]?\s*\d{4,8}\b/gi, '')
    .replace(/\b(?:open box delivery code|delivery code)\s*[:#-]?\s*\d{4,8}\b/gi, '')
    .replace(/\([^)]*(?:awb|tracking|otp|delivery code|open box)[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!product || product.length < 3) return '';
  if (/^(order|delivery|shipment|package)$/i.test(product)) return '';
  if (/^(OTP|AWB|TRACK|TRACKING)[\s:-]/i.test(product)) return '';
  return product;
}

function normalizeProductTitleWithContext(value, options = {}) {
  const product = normalizeProductTitle(value);
  if (!product) return '';
  const seller = tokenizeLabel(options.sellerName || '');
  const company = tokenizeLabel(options.company || '');
  const normalizedProduct = tokenizeLabel(product);
  if (!normalizedProduct) return '';
  if (normalizedProduct === seller || normalizedProduct === company) return '';
  if (isCompanyLikeLabel(normalizedProduct)) return '';
  if (looksLikeReferenceToken(product)) return '';
  if (/\b(?:deliver your order|waiting at your address|your order from|address to deliver)\b/i.test(product)) return '';
  return product;
}

function normalizePartnerName(value, options = {}) {
  const partnerName = normalizeHumanName(value);
  if (!partnerName) return '';
  const normalizedPartner = tokenizeLabel(partnerName);
  const normalizedCompany = tokenizeLabel(options.company || '');
  const normalizedSeller = tokenizeLabel(options.sellerName || '');
  if (normalizedPartner === normalizedCompany || normalizedPartner === normalizedSeller) return '';
  if (normalizedCompany && normalizedPartner.includes(normalizedCompany)) return '';
  return partnerName;
}

function normalizeSellerName(value, options = {}) {
  const sellerName = clean(value);
  if (!sellerName) return '';
  const normalizedSeller = tokenizeLabel(sellerName);
  const normalizedCompany = tokenizeLabel(options.company || '');
  if (!normalizedSeller) return '';
  if (normalizedSeller === normalizedCompany) return '';
  if (isCompanyLikeLabel(normalizedSeller)) return '';
  if (/\b(?:rider|agent|partner|executive|wish master)\b/i.test(sellerName)) return '';
  return sellerName;
}

function buildProvisionalReferenceId(company, extractedData, smsText) {
  const productInfo = clean(extractedData?.productInfo || '');
  const sellerName = clean(extractedData?.sellerName || '');
  const orderHint = clean(extractedData?.orderHint || '');
  const otpCode = clean(extractedData?.otpCode || '');
  const source = [normalizeCompanyName(company), productInfo, sellerName]
    .filter(Boolean)
    .join('|');

  const fallbackSource = [normalizeCompanyName(company), sellerName, orderHint, otpCode]
    .filter(Boolean)
    .join('|');
  const effectiveSource = source || fallbackSource;
  if (!effectiveSource) return '';

  return `provisional:${crypto
    .createHash('md5')
    .update(`${effectiveSource}|${sanitize(smsText).toLowerCase().slice(0, 140)}`)
    .digest('hex')
    .slice(0, 12)}`;
}

function extractReference(text) {
  const body = sanitize(text);
  const tracking = body.match(TRACKING_REGEX)?.[1];
  if (tracking) return { referenceId: normalizeReferenceId(tracking), referenceType: 'tracking_id' };
  const awb = body.match(AWB_REGEX)?.[1];
  if (awb) return { referenceId: normalizeReferenceId(awb), referenceType: 'awb' };
  const orderId = body.match(ORDER_REGEX)?.[1];
  if (orderId) return { referenceId: normalizeReferenceId(orderId), referenceType: 'order_id' };
  const inlineOrderId = body.match(/\border\s+([A-Z0-9-]{8,})\b/i)?.[1];
  if (inlineOrderId) return { referenceId: normalizeReferenceId(inlineOrderId), referenceType: 'order_id' };
  if (/\b(?:ekart|blitz|xpressbees|shadowfax)\s+update:/i.test(body)) {
    return { referenceId: '', referenceType: 'unknown' };
  }
  const fallback = (body.match(FALLBACK_REFERENCE_REGEX) || []).find(token => {
    const v = token.toUpperCase();
    return !v.startsWith('OTP') && !v.startsWith('XXXX') && !v.startsWith('INR') && !/^[0-9]{4,10}$/.test(v);
  });
  const normalizedFallback = normalizeReferenceId(fallback || '');
  return { referenceId: normalizedFallback, referenceType: normalizedFallback ? 'tracking_id' : 'unknown' };
}

function extractOtpCode(text) {
  const match = sanitize(text).match(OTP_REGEX);
  if (!match) return '';
  const digits = String(match[1] || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 8) return '';
  return digits;
}

function extractAwbNumber(text) {
  return sanitize(text).match(AWB_REGEX)?.[1] || '';
}

function extractTimeWindow(text) {
  const body = sanitize(text);
  return clean(
    body.match(/\bvalid till\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\b/i)?.[1] ||
      body.match(/\btill\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\b/i)?.[1] ||
      body.match(TIME_REGEX)?.[1] ||
      ''
  );
}

function extractProductInfo(text) {
  const body = sanitize(text);
  const candidate = normalizeProductTitle(
    body.match(/\b(?:ekart|blitz|xpressbees|shadowfax)\s+update:\s+(.{3,100}?)\s+(?:will be delivered|has been delivered|is out for delivery)\b/i)?.[1] ||
      body.match(/\border\s+of\s+(.{3,100}?)\s+from\b/i)?.[1] ||
      body.match(/\bhey\s+[^,]+,\s+your\s+(.{3,100}?)\s+from\b/i)?.[1] ||
      body.match(/\bhi\s+[^.]+?\.\s+your\s+(.{3,100}?)\s+from\b/i)?.[1] ||
      body.match(/\byour order of\s+(.{3,100}?)\s+from\b/i)?.[1] ||
      body.match(/\byour\s+(.{3,100}?)\s+from\s+[A-Z]/i)?.[1] ||
      ''
  );

  return candidate;
}

function extractSellerName(text) {
  const body = sanitize(text);
  return clean(
    body.match(/\bfrom\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)(?=\s*(?:\(|AWB\b|with\s+(?:Blitz|Xpressbees|Shadowfax|Ekart|Savana)\b|has been successfully delivered\b|has been delivered\b|is out for delivery\b|will be delivered\b|has shipped\b|has been shipped\b|\.|,|!))/i)?.[1] ||
      body.match(/\border\s+from\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)(?=\s*(?:with\b|is\b|will\b|\.|,|!))/i)?.[1] ||
      ''
  );
}

function extractCustomerName(text) {
  const body = sanitize(text);
  return clean(
    body.match(/\bhey\s+([A-Z][A-Za-z ]{2,40}),/i)?.[1] ||
      body.match(/\bdear\s+([A-Z][A-Za-z ]{2,40}),/i)?.[1] ||
      body.match(/\bhi\s+([A-Z][A-Za-z ]{2,40})[,.]/i)?.[1] ||
      ''
  );
}

function extractRiderPhone(text) {
  const body = sanitize(text);
  return clean(
    body.match(/\b(?:rider|executive|agent|partner)\s*\(?([6-9]\d{9})\)?/i)?.[1] ||
      body.match(/\bcall\s*\(?([6-9]\d{9})\)?/i)?.[1] ||
      body.match(/\bcontact(?: rider| partner)?[:\s-]*([6-9]\d{9})\b/i)?.[1] ||
      ''
  );
}

function extractRiderName(text) {
  const body = sanitize(text);
  return normalizeHumanName(
    body.match(/\bi['’`]?m\s+([A-Z][A-Za-z ]{2,40}),\s+your delivery agent\b/i)?.[1] ||
      body.match(/\bby our executive\s+\(?([A-Z][A-Za-z ]{2,40})\)?/i)?.[1] ||
      body.match(/\bdelivery partner\s*[:\-]?\s*([A-Z][A-Za-z0-9 &.-]{2,40})\b/i)?.[1] ||
      body.match(/\bwish master\s*\(?([A-Z][A-Za-z ]{2,40})\)?/i)?.[1] ||
      body.match(/\brider\s*\(?([A-Z][A-Za-z ]{2,40})\)?/i)?.[1] ||
      ''
  );
}

function extractOrderHint(text, productInfo = '', referenceId = '') {
  const body = sanitize(text);
  const explicitOrder =
    body.match(/\border(?: id| no| number)?\s*[:#-]?\s*([A-Z0-9-]{4,})\b/i)?.[1] ||
    body.match(/\border\s+([A-Z0-9-]{6,})\b/i)?.[1];
  const normalizedOrder = normalizeOrderHint(explicitOrder || '', referenceId);
  if (normalizedOrder && normalizedOrder !== referenceId) return normalizedOrder;
  if (referenceId && /^S\d{6,}$/i.test(referenceId)) return referenceId;
  return '';
}

function extractProductInfoSmart(text) {
  const body = sanitize(text);
  const orderIdFromOutForDelivery =
    body.match(/\byour order\s+([A-Z0-9-]{6,})\s*(?:\(|AWB\b|is out for delivery\b)/i)?.[1] ||
    '';
  const orderTitleFallback = orderIdFromOutForDelivery
    ? `Order ${orderIdFromOutForDelivery}`
    : '';

  const product = normalizeProductTitle(
    body.match(/\bi['’`]?ll be delivering your order\s*\((.{3,140}?)\)\s+from\b/i)?.[1] ||
      body.match(/\bEkart Update:\s+OTP\s+\d{4,8}\s+for your shipment\s+(.{3,120}?)\s+with tracking id\b/i)?.[1] ||
      body.match(/\bEkart Update:\s+(.{3,120}?)\s+will be delivered\b/i)?.[1] ||
      body.match(/\byour order\s*\((.{3,140}?)\)\s+is out for delivery\b/i)?.[1] ||
      body.match(/\bOut for Delivery\s*\(Replacement\)\s*:\s*(.{3,120}?)\s+with tracking id\b/i)?.[1] ||
      orderTitleFallback ||
      extractProductInfo(body) ||
      ''
  );
  if (/\b(?:deliver your order|waiting at your address|address to deliver)\b/i.test(product)) {
    return '';
  }
  return product;
}

function extractSellerNameSmart(text) {
  const body = sanitize(text);
  return clean(
    body.match(/\byour\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)\s+order\s*\(/i)?.[1] ||
    body.match(/\bi['’`]?ll be delivering your order\s*\(.{3,140}?\)\s+from\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)(?=\s*\()/i)?.[1] ||
      body.match(/\bdeliver your order from\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60}?)(?=\s+AWB\b)/i)?.[1] ||
      extractSellerName(body) ||
      ''
  );
}

function extractRiderNameSmart(text) {
  const body = sanitize(text);
  return normalizeHumanName(
    body.match(/\bhi,\s*i['â€™`]?m\s+([A-Z][A-Za-z ]{2,40}),\s+your delivery agent\b/i)?.[1] ||
      extractRiderName(body) ||
      ''
  );
}

function extractOrderHintSmart(text, productInfo = '', referenceId = '') {
  const body = sanitize(text);
  const explicitOrder =
    body.match(/\border\s+([A-Z0-9-]{6,})\s+from\b/i)?.[1] ||
    body.match(/\border\s+([A-Z0-9-]{6,})\s+has\b/i)?.[1] ||
    body.match(/\border\s+([A-Z0-9-]{6,})\s+is\b/i)?.[1] ||
    body.match(/\bwith\s+ID\s+([A-Z0-9-]{6,})\b/i)?.[1] ||
    '';
  const normalizedOrder = normalizeOrderHint(explicitOrder || '', referenceId);
  if (normalizedOrder && normalizedOrder !== referenceId) return normalizedOrder;
  return extractOrderHint(body, productInfo, referenceId);
}

function parseExpectedDeliveryDate(text, timeWindow = '') {
  const body = sanitize(text);
  const rangeStart = body.match(DATE_RANGE_REGEX)?.[1];
  const explicit = body.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)?.[1] || rangeStart;
  let base = explicit ? parseSlashDate(explicit) : null;
  if (!base || Number.isNaN(base.getTime())) base = null;
  if (!base && /\btoday\b/i.test(body)) base = new Date();
  if (!base && /\btomorrow\b/i.test(body)) {
    base = new Date();
    base.setDate(base.getDate() + 1);
  }
  if (!base) return null;

  const time = clean(timeWindow);
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i);
  if (!match) return base;
  let hours = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hours += 12;
  base.setHours(hours, Number(match[2] || '0'), 0, 0);
  return base;
}

function parseSlashDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferStatus(text) {
  const body = sanitize(text).toLowerCase();
  if (/\b(?:successfully delivered|has been delivered|delivery completed)\b/.test(body)) return 'delivered';
  if (/\b(?:failed|undelivered|delivery failed|cancelled|canceled)\b/.test(body)) return 'failed';
  if (OTP_REGEX.test(body) && hasDeliveryContext(body)) return 'upon_arrival';
  if (/\b(?:out for delivery|on the way|waiting at your address|wish master)\b/.test(body)) return 'out_for_delivery';
  if (/\b(?:arriving soon|arriving today|expected today|reach you by|will be delivered|has been shipped)\b/.test(body)) return 'arriving_soon';
  if (/\b(?:ordered|order confirmed|dispatched|shipped|shipment created)\b/.test(body)) return 'initiated';
  return 'unknown';
}

function normalizeDeliveryStatus(status, text) {
  const body = sanitize(text).toUpperCase();
  if (/\b(?:WILL BE DELIVERED|WILL REACH YOU|OUT FOR DELIVERY|ARRIVING SOON|HAS BEEN SHIPPED|ON THE WAY|WAITING AT YOUR ADDRESS)\b/.test(body)) {
    return OTP_REGEX.test(body) ? 'upon_arrival' : 'arriving_soon';
  }
  if (/\b(?:SUCCESSFULLY DELIVERED|HAS BEEN SUCCESSFULLY DELIVERED|HAS BEEN DELIVERED|DELIVERY COMPLETED)\b/.test(body)) {
    return 'delivered';
  }
  return status;
}

function resolveNextStatus(currentStatus, incomingStatus) {
  const current = currentStatus || 'unknown';
  const incoming = incomingStatus || 'unknown';
  if (incoming === 'unknown') return current;
  if (current === 'delivered' || current === 'failed') return current;
  if ((STATUS_PRIORITY[incoming] || 0) >= (STATUS_PRIORITY[current] || 0)) {
    return incoming;
  }
  return current;
}

function extractMessageType(status, text) {
  const upper = sanitize(text).toUpperCase();
  if (status === 'delivered') return 'delivery_confirmation';
  if (status === 'upon_arrival') return 'otp_notification';
  if (status === 'out_for_delivery' || status === 'arriving_soon') return 'status_update';
  if (status === 'initiated') return 'order_confirmation';
  if (upper.includes('OTP') || upper.includes('DELIVERY CODE')) return 'otp_notification';
  return 'unknown';
}

function createEmptyExtraction() {
  return {
    referenceId: '',
    referenceType: 'unknown',
    status: 'unknown',
    messageType: 'unknown',
    extractedData: {
      riderName: '',
      riderPhone: '',
      customerName: '',
      awbNumber: '',
      otpCode: '',
      orderHint: '',
      expectedDeliveryDate: '',
      expectedDeliveryDateParsed: null,
      deliveryTimeWindow: '',
      productInfo: '',
      sellerName: '',
      receiverAddress: '',
      messageType: 'unknown',
    },
  };
}

function mergeExtraction(base, fallback) {
  const baseRef = normalizeReferenceId(base.referenceId);
  const fallbackRef = normalizeReferenceId(fallback.referenceId);
  const mergedExpectedDate =
    base.extractedData.expectedDeliveryDateParsed || fallback.extractedData.expectedDeliveryDateParsed || null;

  return {
    referenceId: baseRef || fallbackRef || '',
    referenceType: baseRef && base.referenceType !== 'unknown' ? base.referenceType : fallback.referenceType || 'unknown',
    status: base.status !== 'unknown' ? base.status : fallback.status,
    messageType: base.messageType !== 'unknown' ? base.messageType : fallback.messageType,
    extractedData: {
      ...fallback.extractedData,
      ...base.extractedData,
      riderPhone: base.extractedData.riderPhone || fallback.extractedData.riderPhone || '',
      customerName: base.extractedData.customerName || fallback.extractedData.customerName || '',
      awbNumber: base.extractedData.awbNumber || fallback.extractedData.awbNumber || '',
      otpCode: base.extractedData.otpCode || fallback.extractedData.otpCode || '',
      orderHint: base.extractedData.orderHint || fallback.extractedData.orderHint || '',
      deliveryTimeWindow: base.extractedData.deliveryTimeWindow || fallback.extractedData.deliveryTimeWindow || '',
      expectedDeliveryDate: mergedExpectedDate ? mergedExpectedDate.toISOString() : '',
      expectedDeliveryDateParsed: mergedExpectedDate,
      productInfo: chooseBetterValue(base.extractedData.productInfo, fallback.extractedData.productInfo),
      sellerName: chooseBetterValue(base.extractedData.sellerName, fallback.extractedData.sellerName),
      receiverAddress: base.extractedData.receiverAddress || fallback.extractedData.receiverAddress || '',
      messageType: base.extractedData.messageType !== 'unknown' ? base.extractedData.messageType : fallback.extractedData.messageType,
    },
  };
}

function isRelevantDeliverySms(text, detection, extraction) {
  const body = sanitize(text);
  if (NON_DELIVERY_REGEX.test(body) && !DELIVERY_SIGNAL_REGEX.test(body)) return false;
  if (DELIVERY_SIGNAL_REGEX.test(body)) return true;
  if (extraction.referenceId || extraction.extractedData.awbNumber) return true;
  if (extraction.extractedData.otpCode && hasDeliveryContext(body)) return true;
  return normalizeCompanyName(detection.company) !== 'unknown' && hasDeliveryContext(body);
}

function chooseBetterValue(currentValue, incomingValue) {
  const current = clean(currentValue);
  const incoming = clean(incomingValue);
  if (!incoming) return current;
  if (!current) return incoming;
  const currentIsOrderIdFallback = /^order\s+[A-Z0-9-]{6,}$/i.test(current);
  const incomingIsOrderIdFallback = /^order\s+[A-Z0-9-]{6,}$/i.test(incoming);
  if (currentIsOrderIdFallback && !incomingIsOrderIdFallback) return incoming;
  if (!currentIsOrderIdFallback && incomingIsOrderIdFallback) return current;
  if (current.startsWith('ORD-') && !incoming.startsWith('ORD-')) return incoming;
  if (current.startsWith('provisional:') && !incoming.startsWith('provisional:')) return incoming;
  if (incoming.length > current.length + 3) return incoming;
  return current;
}

function chooseBetterDate(currentValue, incomingValue) {
  if (!incomingValue) return currentValue;
  if (!currentValue) return incomingValue;
  const currentTime = new Date(currentValue).getTime();
  const incomingTime = new Date(incomingValue).getTime();
  if (Number.isNaN(currentTime)) return incomingValue;
  if (Number.isNaN(incomingTime)) return currentValue;
  return incomingTime < currentTime ? incomingValue : currentValue;
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function getAiExtractionMode() {
  const mode = String(env.OLLAMA_EXTRACTION_MODE || 'fallback').trim().toLowerCase();
  if (mode === 'only' || mode === 'ai_only' || mode === 'ollama_only') return 'only';
  if (mode === 'off') return 'off';
  if (mode === 'prefer') return 'prefer';
  return 'fallback';
}

function isAiOnlyExtractionMode() {
  return getAiExtractionMode() === 'only';
}

function shouldUseAiExtraction() {
  return getAiExtractionMode() !== 'off' && Boolean(env.OLLAMA_ENABLED || env.OLLAMA_BASE_URL || env.OLLAMA_MODEL);
}

function mapAiPlatformToCompany(platform) {
  const normalized = normalizeCompanyName(platform || '');
  if (!normalized || normalized === 'unknown') return '';

  const directMatch = COMPANY_MATCHERS.find(([company]) => company === normalized);
  if (directMatch) return directMatch[0];

  const aliasMatch = COMPANY_MATCHERS.find(([, patterns]) =>
    patterns.some(pattern => pattern.test(String(platform || '')))
  );
  return aliasMatch?.[0] || normalized;
}

function inferCompanyFromText(text) {
  const detection = detectCompanyHeuristic(text);
  return detection?.company && detection.company !== 'unknown' ? detection.company : '';
}

function buildAiExtraction(aiPayload) {
  const ai = aiPayload?.extracted || {};
  const deliveryDateText = clean(ai.delivery_date || '');
  const timeWindow = extractTimeWindow(deliveryDateText);
  const expectedDate = parseExpectedDeliveryDate(deliveryDateText, timeWindow);
  const smsText = String(aiPayload?.smsText || '');
  const normalizedAwb = normalizeAwbNumber(sanitizeReferenceCandidate(ai.awb_number || ''));
  const normalizedOrderId = normalizeReferenceId(sanitizeReferenceCandidate(ai.order_id || '') || ai.order_id || '');
  const company = mapAiPlatformToCompany(
    ai.courier_company || ai.platform || inferCompanyFromText(smsText)
  );
  const sellerName = normalizeSellerName(ai.seller_name || '', { company });

  return {
    company,
    referenceId: normalizedOrderId || normalizedAwb || '',
    referenceType: normalizedOrderId ? 'order_id' : normalizedAwb ? 'awb' : 'unknown',
    status: 'unknown',
    messageType: 'unknown',
    extractedData: {
      riderName: '',
      riderPhone: '',
      customerName: '',
      awbNumber: normalizedAwb,
      otpCode: clean(ai.otp || ''),
      orderHint: normalizedOrderId,
      expectedDeliveryDate: expectedDate ? expectedDate.toISOString() : '',
      expectedDeliveryDateParsed: expectedDate,
      deliveryTimeWindow: timeWindow,
      productInfo: normalizeProductTitleWithContext(ai.title || '', { sellerName, company }),
      sellerName,
      receiverAddress: '',
      messageType: 'unknown',
    },
  };
}

function mergeAiExtraction(current, ai) {
  if (!ai) return current;

  return {
    ...current,
    referenceId: current.referenceId || ai.referenceId || '',
    referenceType:
      current.referenceType && current.referenceType !== 'unknown'
        ? current.referenceType
        : ai.referenceType || 'unknown',
    extractedData: {
      ...current.extractedData,
      awbNumber: current.extractedData.awbNumber || ai.extractedData.awbNumber || '',
      otpCode: current.extractedData.otpCode || ai.extractedData.otpCode || '',
      orderHint: current.extractedData.orderHint || ai.extractedData.orderHint || '',
      deliveryTimeWindow:
        current.extractedData.deliveryTimeWindow || ai.extractedData.deliveryTimeWindow || '',
      expectedDeliveryDate:
        current.extractedData.expectedDeliveryDate || ai.extractedData.expectedDeliveryDate || '',
      expectedDeliveryDateParsed:
        current.extractedData.expectedDeliveryDateParsed || ai.extractedData.expectedDeliveryDateParsed || null,
      productInfo: chooseBetterValue(current.extractedData.productInfo, ai.extractedData.productInfo),
      sellerName: chooseBetterValue(
        normalizeSellerName(current.extractedData.sellerName, { company: current.company || '' }),
        normalizeSellerName(ai.extractedData.sellerName, { company: ai.company || '' }),
      ),
    },
  };
}

function classifyDeliverySms(text, senderPhone, detection, extraction) {
  const body = sanitize(text);
  const senderDetection = detectCompanyFromSender(senderPhone);
  const trustedDeliverySender = Boolean(senderDetection);
  const explicitDeliverySignal = DELIVERY_SIGNAL_REGEX.test(body);
  const deliveryContext = hasDeliveryContext(body);
  const blockedByNegative = NON_DELIVERY_REGEX.test(body) && !explicitDeliverySignal;
  const hasStrongIdentity =
    Boolean(extraction.referenceId) ||
    Boolean(extraction.extractedData.awbNumber) ||
    Boolean(extraction.extractedData.otpCode);

  return {
    isDelivery:
      !blockedByNegative &&
      (trustedDeliverySender ||
        explicitDeliverySignal ||
        (deliveryContext && hasStrongIdentity) ||
        (normalizeCompanyName(detection.company) !== 'unknown' && deliveryContext)),
    trustedDeliverySender,
  };
}

function finalizeExtraction(text, detection, extraction) {
  const normalizedReferenceId = normalizeReferenceId(
    extraction.referenceId || extraction.extractedData.awbNumber || ''
  );
  const awbNumber = normalizeAwbNumber(extraction.extractedData.awbNumber);
  const orderHint = normalizeOrderHint(extraction.extractedData.orderHint, normalizedReferenceId);
  const otpCode = normalizeOtpCode(
    extraction.extractedData.otpCode,
    text,
    awbNumber,
    normalizedReferenceId
  );
  const sellerName = normalizeSellerName(extraction.extractedData.sellerName, {
    company: detection.company,
  });
  const productInfo = normalizeProductTitleWithContext(extraction.extractedData.productInfo, {
    sellerName,
    company: detection.company,
  });
  const riderName = normalizePartnerName(extraction.extractedData.riderName, {
    sellerName,
    company: detection.company,
  });
  const riderPhone = clean(extraction.extractedData.riderPhone);
  const status = normalizeDeliveryStatus(extraction.status, text);
  const messageType = extractMessageType(status, text);
  const resolvedReferenceId =
    normalizedReferenceId ||
    awbNumber ||
    normalizeReferenceId(orderHint);
  const resolvedOrderHint =
    orderHint ||
    (extraction.referenceType === 'order_id' ? normalizedReferenceId : '');

  return {
    ...extraction,
    referenceId: resolvedReferenceId,
    status,
    messageType,
    extractedData: {
      ...extraction.extractedData,
      awbNumber,
      orderHint: resolvedOrderHint,
      otpCode,
      productInfo,
      sellerName,
      riderName,
      riderPhone,
      messageType,
    },
  };
}

class SmsParserService {
  async detectCompany(smsText, senderPhone = '') {
    const senderDetection = detectCompanyFromSender(senderPhone);
    if (senderDetection) {
      return senderDetection;
    }

    const forcedCompany = extractPrefixedCompany(smsText) || extractExplicitDeliveryPartnerCompany(smsText);
    if (forcedCompany) {
      return { company: forcedCompany, confidence: 96, pattern: `forced_company_${forcedCompany}` };
    }

    const heuristicCompany = detectCompanyHeuristic(smsText);
    return heuristicCompany;
  }

  async extractData(smsText, company) {
    const text = sanitize(smsText);
    const extractedWithPattern = createEmptyExtraction();
    extractedWithPattern.status = 'unknown';
    extractedWithPattern.extractedData = createEmptyExtraction().extractedData;
    extractedWithPattern.messageType = extractMessageType(extractedWithPattern.status, text);
    extractedWithPattern.extractedData.messageType = extractedWithPattern.messageType;

    const heuristicReference = extractReference(text);
    const timeWindow = extractTimeWindow(text);
    const productInfo = extractProductInfoSmart(text);
    const expectedDate = parseExpectedDeliveryDate(text, timeWindow);
    const deterministicExtraction = mergeExtraction(extractedWithPattern, {
      referenceId: heuristicReference.referenceId,
      referenceType: heuristicReference.referenceType,
      status: inferStatus(text),
      messageType: extractMessageType(inferStatus(text), text),
      extractedData: {
        riderName: extractRiderNameSmart(text),
        riderPhone: extractRiderPhone(text),
        customerName: extractCustomerName(text),
        awbNumber: extractAwbNumber(text),
        otpCode: extractOtpCode(text),
        orderHint: extractOrderHintSmart(text, productInfo, heuristicReference.referenceId),
        expectedDeliveryDate: expectedDate ? expectedDate.toISOString() : '',
        expectedDeliveryDateParsed: expectedDate,
        deliveryTimeWindow: timeWindow,
        productInfo,
        sellerName: extractSellerNameSmart(text),
        receiverAddress: '',
        messageType: extractMessageType(inferStatus(text), text),
      },
    });

    if (!shouldUseAiExtraction()) {
      return {
        extraction: deterministicExtraction,
        aiCompany: '',
        aiMeta: null,
      };
    }

    try {
      const aiResult = await ollamaDeliveryExtractorService.extractDeliveryContext(text);
      const aiExtraction = buildAiExtraction(aiResult);
      return {
        extraction: mergeAiExtraction(deterministicExtraction, aiExtraction),
        aiCompany: aiExtraction.company,
        aiMeta: aiResult,
      };
    } catch (error) {
      safeLog('[SmsParser] AI extraction fallback to deterministic parser:', error.message);
      return {
        extraction: deterministicExtraction,
        aiCompany: '',
        aiMeta: null,
      };
    }
  }

  generateScheduleGroupId(company, referenceId) {
    return crypto.createHash('md5').update(`${normalizeCompanyName(company)}|${String(referenceId || '').trim()}`).digest('hex');
  }

  async processSms(homeId, smsText, senderPhone, messageId) {
    if (messageId) {
      const existingSmsLog = await SmsLog.findOne({ homeId, messageId });
      if (existingSmsLog) {
        let scheduleUpdated = false;
        let scheduleId = null;
        let scheduleIsNew = false;
        if (existingSmsLog.referenceId || existingSmsLog.extractedData?.awbNumber) {
          const scheduleUpdateResult = await this.updateDeliverySchedule(homeId, existingSmsLog);
          scheduleUpdated = Boolean(scheduleUpdateResult.updated);
          scheduleId = scheduleUpdateResult.scheduleId || null;
          scheduleIsNew = Boolean(scheduleUpdateResult.isNew);
        }
        return { success: true, ignored: false, duplicate: true, smsLog: existingSmsLog, scheduleUpdated, scheduleId, scheduleIsNew };
      }
    }

    // Layer 1: sender/content based delivery classification
    let detection = await this.detectCompany(smsText, senderPhone);
    // Layer 2: field-by-field extraction
    const extractedResult = await this.extractData(smsText, detection.company);
    const extracted = extractedResult.extraction;
    if (
      extractedResult.aiCompany &&
      (isAiOnlyExtractionMode() ||
        detection.company === 'unknown' ||
        detection.pattern?.startsWith('db_') ||
        detection.confidence < 80)
    ) {
      detection = {
        ...detection,
        company: extractedResult.aiCompany,
        confidence: Math.max(detection.confidence || 0, 85),
        pattern: `ai_company_${extractedResult.aiCompany}`,
      };
    }
    // Layer 3: validation, cleanup, and canonical field shaping
    const extraction = finalizeExtraction(smsText, detection, extracted);
    const classification = classifyDeliverySms(smsText, senderPhone, detection, extraction);

    if (!classification.isDelivery || !isRelevantDeliverySms(smsText, detection, extraction)) {
      return { success: true, ignored: true, reason: 'non_delivery_sms', scheduleUpdated: false, scheduleId: null, scheduleIsNew: false, smsLog: null };
    }

    const canonicalReferenceId =
      normalizeReferenceId(extraction.referenceId) ||
      normalizeReferenceId(extraction.extractedData.awbNumber) ||
      buildProvisionalReferenceId(detection.company, extraction.extractedData, smsText);

    const parsed = Boolean(canonicalReferenceId);

    const smsLog = new SmsLog({
      homeId,
      rawText: smsText,
      senderPhone,
      messageId,
      deliveryCompany: normalizeCompanyName(detection.company),
      detectedAt: new Date(),
      confidenceScore: detection.confidence,
      matchedPattern: detection.pattern || '',
      referenceId: canonicalReferenceId,
      referenceType:
        canonicalReferenceId.startsWith('provisional:')
          ? 'unknown'
          : extraction.referenceType && extraction.referenceType !== 'unknown'
            ? extraction.referenceType
            : extraction.extractedData.awbNumber
              ? 'awb'
              : 'unknown',
      status: extraction.status || 'unknown',
      extractedData: {
        ...extraction.extractedData,
        messageType: extraction.messageType,
      },
      parsed,
    });

    let savedSmsLog;
    try {
      savedSmsLog = await smsLog.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        savedSmsLog =
          (messageId ? await SmsLog.findOne({ homeId, messageId }) : null) ||
          (canonicalReferenceId
            ? await SmsLog.findOne({
                homeId,
                referenceId: canonicalReferenceId,
                rawText: smsText,
              }).sort({ createdAt: -1 })
            : null);
        if (!savedSmsLog) throw error;
      } else {
        throw error;
      }
    }
    if (parsed && canonicalReferenceId) {
      const scheduleUpdateResult = await this.updateDeliverySchedule(homeId, savedSmsLog);
      return {
        success: true,
        smsLog: savedSmsLog,
        scheduleUpdated: scheduleUpdateResult.updated,
        scheduleId: scheduleUpdateResult.scheduleId,
        scheduleIsNew: Boolean(scheduleUpdateResult.isNew),
      };
    }
    return { success: true, smsLog: savedSmsLog, scheduleUpdated: false, scheduleId: null, scheduleIsNew: false };
  }

  applySmsToSchedule(schedule, smsLog) {
    const x = smsLog.extractedData || {};
    schedule.latestSmsId = smsLog._id;
    if (!schedule.smsIds.some(id => String(id) === String(smsLog._id))) {
      schedule.smsIds.push(smsLog._id);
    }
    schedule.smsCount = schedule.smsIds.length;
    if (smsLog.deliveryCompany && smsLog.deliveryCompany !== 'unknown') schedule.deliveryCompany = normalizeCompanyName(smsLog.deliveryCompany);
    if (smsLog.referenceId) {
      schedule.referenceId = chooseBetterValue(schedule.referenceId, smsLog.referenceId);
    }
    if (x.riderName) schedule.riderName = x.riderName;
    if (x.riderPhone) schedule.riderPhone = x.riderPhone;
    if (x.otpCode) schedule.otpCode = x.otpCode;
    if (x.orderHint) schedule.orderHint = chooseBetterValue(schedule.orderHint, x.orderHint);
    if (x.awbNumber) schedule.awbNumber = x.awbNumber;
    if (x.sellerName) schedule.sellerName = chooseBetterValue(schedule.sellerName, x.sellerName);
    if (x.productInfo) schedule.productSummary = chooseBetterValue(schedule.productSummary, x.productInfo);
    if (x.receiverAddress) schedule.receiverAddress = x.receiverAddress;
    if (x.customerName) schedule.customerName = x.customerName;
    if (x.deliveryTimeWindow) schedule.deliveryTimeWindow = x.deliveryTimeWindow;
    if (x.expectedDeliveryDateParsed) {
      schedule.expectedDeliveryDate = chooseBetterDate(schedule.expectedDeliveryDate, x.expectedDeliveryDateParsed);
    }
  }

  async updateDeliverySchedule(homeId, smsLog) {
    const canonicalReferenceId = smsLog.referenceId || smsLog.extractedData?.awbNumber || '';
    if (!canonicalReferenceId) return { updated: false, scheduleId: null, isNew: false };

    const normalizedCompany = normalizeCompanyName(smsLog.deliveryCompany);
    const scheduleGroupId = this.generateScheduleGroupId(normalizedCompany, canonicalReferenceId);
    let schedule = await DeliverySchedule.findOne({
      homeId,
      $or: [
        { scheduleGroupId },
        { referenceId: canonicalReferenceId, deliveryCompany: normalizedCompany },
        { referenceId: canonicalReferenceId },
      ],
    });

    if (!schedule) {
      const productSummary = clean(smsLog.extractedData?.productInfo || '');
      const sellerName = clean(smsLog.extractedData?.sellerName || '');
      const riderPhone = clean(smsLog.extractedData?.riderPhone || '');
      const provisionalCandidates = await DeliverySchedule.find({
        homeId,
        deliveryCompany: normalizedCompany,
        currentStatus: { $in: ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'] },
        $or: [
          { referenceId: /^provisional:/ },
          { referenceId: canonicalReferenceId },
        ],
      }).sort({ updatedAt: -1 }).limit(10);

      schedule =
        provisionalCandidates.find(candidate =>
          (productSummary && clean(candidate.productSummary) === productSummary) ||
          (sellerName && clean(candidate.sellerName) === sellerName) ||
          (riderPhone && clean(candidate.riderPhone) === riderPhone) ||
          (smsLog.extractedData?.orderHint &&
            clean(candidate.orderHint) === clean(smsLog.extractedData.orderHint)),
        ) || null;

      if (schedule && schedule.referenceId?.startsWith('provisional:') && !canonicalReferenceId.startsWith('provisional:')) {
        schedule.referenceId = canonicalReferenceId;
        schedule.scheduleGroupId = scheduleGroupId;
      }
    }

    const incomingStatus = smsLog.status && smsLog.status !== 'unknown' ? smsLog.status : 'initiated';
    const nextStatus = resolveNextStatus(schedule?.currentStatus, incomingStatus);
    const isNewSchedule = !schedule;
    if (!schedule) {
      schedule = new DeliverySchedule({
        homeId,
        scheduleGroupId,
        referenceId: canonicalReferenceId,
        deliveryCompany: normalizedCompany,
        currentStatus: incomingStatus,
        customerName: smsLog.extractedData?.customerName || '',
        latestSmsId: smsLog._id,
        smsIds: [],
        smsCount: 0,
        statusHistory: [],
      });
    }

    this.applySmsToSchedule(schedule, smsLog);
    if (!schedule.statusHistory.some(entry => String(entry.smsId) === String(smsLog._id))) {
      schedule.statusHistory.push({
        status: incomingStatus,
        updatedAt: new Date(),
        smsId: smsLog._id,
        messageSummary: String(smsLog.rawText || '').substring(0, 120),
      });
    }

    if (nextStatus !== 'unknown') schedule.currentStatus = nextStatus;
    if (nextStatus === 'delivered') {
      schedule.markedDelivered = true;
      schedule.completedAt = new Date();
    } else {
      schedule.markedDelivered = false;
      schedule.completedAt = null;
    }

    try {
      await schedule.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const existingSchedule = await DeliverySchedule.findOne({
          homeId,
          $or: [
            { scheduleGroupId },
            { referenceId: canonicalReferenceId, deliveryCompany: normalizedCompany },
            { referenceId: canonicalReferenceId },
          ],
        });
        if (!existingSchedule) throw error;
        schedule = existingSchedule;
        this.applySmsToSchedule(schedule, smsLog);
        if (!schedule.statusHistory.some(entry => String(entry.smsId) === String(smsLog._id))) {
          schedule.statusHistory.push({
            status: incomingStatus,
            updatedAt: new Date(),
            smsId: smsLog._id,
            messageSummary: String(smsLog.rawText || '').substring(0, 120),
          });
        }
        if (nextStatus !== 'unknown') schedule.currentStatus = nextStatus;
        if (nextStatus === 'delivered') {
          schedule.markedDelivered = true;
          schedule.completedAt = new Date();
        } else {
          schedule.markedDelivered = false;
          schedule.completedAt = null;
        }
        await schedule.save();
      } else {
        throw error;
      }
    }
    return { updated: true, scheduleId: schedule._id, isNew: isNewSchedule };
  }

  async getUpcomingDeliveries(homeId, options = {}) {
    const { status = ['initiated', 'arriving_soon', 'out_for_delivery', 'upon_arrival'], limit = 50, skip = 0 } = options;
    const query = { homeId };
    if (status?.length) query.currentStatus = { $in: status };
    const deliveries = await DeliverySchedule.find(query)
      .populate('latestSmsId', 'rawText extractedData status')
      .populate('smsIds', 'status extractedData')
      .sort({ expectedDeliveryDate: 1, updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await DeliverySchedule.countDocuments(query);
    return {
      deliveries: deliveries.map((item) => ({
        ...item,
        arrivedByTablet: computeArrivedByTablet(item),
      })),
      total,
    };
  }

  async getDeliveryHistory(homeId, options = {}) {
    const { limit = 50, skip = 0 } = options;
    const query = { homeId, currentStatus: { $in: ['delivered', 'failed'] } };
    const deliveries = await DeliverySchedule.find(query)
      .populate('latestSmsId', 'rawText extractedData status')
      .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await DeliverySchedule.countDocuments(query);
    return {
      deliveries: deliveries.map((item) => ({
        ...item,
        arrivedByTablet: computeArrivedByTablet(item),
      })),
      total,
    };
  }

  async searchDeliveries(homeId, searchParams = {}) {
    const { referenceId, company, limit = 50, skip = 0 } = searchParams;
    const query = { homeId };
    if (referenceId) query.referenceId = { $regex: referenceId, $options: 'i' };
    if (company) query.deliveryCompany = normalizeCompanyName(company);
    const deliveries = await DeliverySchedule.find(query)
      .populate('latestSmsId')
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await DeliverySchedule.countDocuments(query);
    return {
      deliveries: deliveries.map((item) => ({
        ...item,
        arrivedByTablet: computeArrivedByTablet(item),
      })),
      total,
    };
  }
}

module.exports = new SmsParserService();
