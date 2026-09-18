import {DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS} from './deliveryNotificationAccess';
import {logs} from '../logs';

export type ParsedDeliveryNotification = {
  merchantName: string;
  productTitle: string;
  courierName: string;
  orderTrackingId: string;
  deliveryDate: string;
  deliveryTimeWindow: string;
  deliveryStatus:
    | 'initiated'
    | 'arriving_soon'
    | 'out_for_delivery'
    | 'scheduled'
    | 'delivered'
    | 'failed';
  needsConfirmation: boolean;
  confidence: number;
  keywordMatches: string[];
};

const KNOWN_COMPANIES = [
  'Amazon',
  'Flipkart',
  'Myntra',
  'Ekart',
  'Shadowfax',
  'Xpressbees',
  'Delhivery',
  'Blue Dart',
  'DTDC',
  'Ecom Express',
  'Shiprocket',
  'FedEx',
  'DHL',
  'India Post',
  'Ajio',
  'Nykaa',
  'Meesho',
  'Savana',
  'Tira',
  'Zara',
  'Blinkit',
  'Zepto',
  'BigBasket',
];

export function normalizeDeliveryNotificationText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDeliveryNotificationText(options: {
  title?: string | null;
  body?: string | null;
  postedAt?: Date;
  keywords?: string[];
}): ParsedDeliveryNotification | null {
  const title = normalizeDeliveryNotificationText(options.title);
  const body = normalizeDeliveryNotificationText(options.body);
  const text = [title, body].filter(Boolean).join(' ');

  if (!text) {
    logs.error('[delivery-notification-parser] hidden or empty notification text');
    return null;
  }

  const keywords = options.keywords?.length
    ? options.keywords
    : DEFAULT_DELIVERY_NOTIFICATION_KEYWORDS;
  const keywordMatches = keywords
    .map(item => item.trim().toLowerCase())
    .filter(item => item && text.toLowerCase().includes(item));

  if (!keywordMatches.length) {
    return null;
  }

  const merchantName = detectCompany(text, title);
  const productTitle = extractProductTitle(body, text, merchantName);
  const courierName = detectCourier(text, merchantName);
  const orderTrackingId = extractReferenceId(text);
  const deliveryTimeWindow = extractTimeWindow(text);
  const deliveryDate = extractDeliveryDate(text, options.postedAt ?? new Date());
  const deliveryStatus = inferDeliveryStatus(text);
  const needsConfirmation =
    !orderTrackingId ||
    !deliveryDate ||
    !deliveryTimeWindow ||
    deliveryStatus === 'delivered';

  const confidence = Math.min(
    100,
    30 +
      Math.min(keywordMatches.length, 4) * 5 +
      (merchantName ? 10 : 0) +
      (productTitle ? 10 : 0) +
      (orderTrackingId ? 20 : 0) +
      (deliveryDate ? 15 : 0) +
      (deliveryTimeWindow ? 15 : 0) +
      (deliveryStatus !== 'initiated' ? 10 : 0),
  );

  if (!productTitle) {
    logs.error('[delivery-notification-parser] product title missing from notification text');
  } else {
    logs.info('[delivery-notification-parser] product title extracted', {
      length: productTitle.length,
    });
  }

  logs.info('[delivery-notification-parser] parsed notification text', {
    confidence,
    needsConfirmation,
    hasProductTitle: Boolean(productTitle),
  });

  return {
    merchantName,
    productTitle,
    courierName,
    orderTrackingId,
    deliveryDate,
    deliveryTimeWindow,
    deliveryStatus,
    needsConfirmation,
    confidence,
    keywordMatches: Array.from(new Set(keywordMatches)),
  };
}

function detectCompany(text: string, title: string) {
  const known = KNOWN_COMPANIES.find(company =>
    new RegExp(`\\b${escapeRegex(company).replace(/\s+/g, '\\s+')}\\b`, 'i').test(text),
  );
  if (known) return known;

  return title
    .replace(/^(messages|sms|notification|android system)$/i, '')
    .replace(/^[A-Z]{2}-/i, '')
    .replace(/[^A-Za-z0-9 &.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function detectCourier(text: string, merchantName: string) {
  const courier = KNOWN_COMPANIES.find(company =>
    new RegExp(`\\b${escapeRegex(company).replace(/\s+/g, '\\s+')}\\b`, 'i').test(text),
  );
  return courier && courier.toLowerCase() !== merchantName.toLowerCase()
    ? courier
    : '';
}

function extractProductTitle(body: string, text: string, merchantName: string) {
  const searchTexts = [body, text].filter(Boolean);
  const patterns = [
    /\b(?:confirm\s+your\s+availability\s+for|availability\s+for)\s+(.+?)(?=\s*[*_]*\s*(?:great\s+news\b|we(?:'|’|\s+a)re\b|ready\s+to\s+deliver\b|for\s+a\s+smooth\b|between\b|today\b|tomorrow\b|[.!?]|$))/i,
    /\byour\s+(.+?)\s+(?:is|has\s+been|will\s+be)\s+(?:out\s+for\s+delivery|ready\s+to\s+deliver|arriving|scheduled|delivered)\b/i,
    /\b(?:product|item|package)\s*(?:title|name)?\s*(?:is|:|-)\s+(.+?)(?=\s*(?:order\b|awb\b|tracking\b|great\s+news\b|between\b|today\b|tomorrow\b|[.!?]|$))/i,
    /\border\s+for\s+(.+?)(?=\s*(?:is|has\s+been|will\s+be|great\s+news\b|between\b|today\b|tomorrow\b|[.!?]|$))/i,
  ];

  for (const source of searchTexts) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const candidate = sanitizeProductTitle(match?.[1] || '', merchantName);
      if (candidate) {
        logs.info('[delivery-notification-parser] product candidate accepted');
        return candidate;
      }
    }
  }

  logs.error('[delivery-notification-parser] product candidate not found');
  return '';
}

function sanitizeProductTitle(value: string, merchantName: string) {
  const candidate = normalizeDeliveryNotificationText(value)
    .replace(/[*_`~]+/g, ' ')
    .replace(/[^\p{L}\p{N} &:,./+()-]/gu, ' ')
    .replace(/\b(?:great\s+news|ready\s+to\s+deliver|confirm\s+your\s+availability|collect\s+the\s+order)\b.*$/i, '')
    .replace(/\b(?:order|awb|tracking|shipment|courier)\s*(?:id|no|number)?\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, '')
    .slice(0, 120);

  const lower = candidate.toLowerCase();
  const merchantLower = merchantName.toLowerCase();
  const generic = new Set([
    'delivery',
    'order',
    'your order',
    'package',
    'shipment',
    'item',
    'product',
  ]);
  const isOnlyCompany =
    candidate.toLowerCase() === merchantLower ||
    KNOWN_COMPANIES.some(company => candidate.toLowerCase() === company.toLowerCase()) ||
    (merchantLower && lower === `${merchantLower} delivery`);

  if (
    candidate.length < 3 ||
    generic.has(lower) ||
    isOnlyCompany ||
    !/[\p{L}\p{N}]/u.test(candidate)
  ) {
    logs.info('[delivery-notification-parser] product candidate rejected');
    return '';
  }

  logs.info('[delivery-notification-parser] product candidate sanitized', {
    length: candidate.length,
  });
  return candidate;
}

function extractReferenceId(text: string) {
  const labeled = text.match(
    /\b(?:awb|airway\s*bill|waybill|tracking(?:\s*id)?|track(?:ing)?(?:\s*(?:id|no|number))?|shipment(?:\s*(?:id|no|number))?|consignment(?:\s*(?:id|no|number))?|order(?:\s*(?:id|no|number)|#)?|package(?:\s*(?:id|no|number))?)\s*[:#-]?\s*((?=[A-Z0-9-]{5,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+)\b/i,
  );
  if (labeled?.[1]) return sanitizeReference(labeled[1]);

  const fallback = text.match(/\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/gi);
  return sanitizeReference(
    fallback?.find(token => !/^\d{4,8}$/.test(token)) || '',
  );
}

function sanitizeReference(value: string) {
  return normalizeDeliveryNotificationText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 80);
}

function extractTimeWindow(text: string) {
  const range = text.match(
    /\b(?:between\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
  );
  if (range?.[1] && range[2]) {
    return `${range[1].toUpperCase()} - ${range[2].toUpperCase()}`;
  }

  const byTime = text.match(/\b(?:by|before|till|until|valid till)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  return byTime?.[1] ? `By ${byTime[1].toUpperCase()}` : '';
}

function extractDeliveryDate(text: string, postedAt: Date) {
  const lower = text.toLowerCase();
  const base = new Date(postedAt);
  const time = getStartTime(text);

  if (lower.includes('arriving today') || lower.includes('today')) {
    return withLocalTime(base, time).toISOString();
  }

  if (lower.includes('tomorrow')) {
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    return withLocalTime(next, time).toISOString();
  }

  const numeric = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric?.[1] && numeric[2]) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : base.getFullYear();
    const date = new Date(year, Number(numeric[2]) - 1, Number(numeric[1]));
    return Number.isNaN(date.getTime()) ? '' : withLocalTime(date, time).toISOString();
  }

  const monthMatch = lower.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (monthMatch?.[1] && monthMatch[2]) {
    const monthIndex = monthToIndex(monthMatch[2]);
    if (monthIndex >= 0) {
      const date = new Date(base.getFullYear(), monthIndex, Number(monthMatch[1]));
      if (date.getTime() < base.getTime() - 24 * 60 * 60 * 1000) {
        date.setFullYear(date.getFullYear() + 1);
      }
      return withLocalTime(date, time).toISOString();
    }
  }

  return '';
}

function inferDeliveryStatus(text: string): ParsedDeliveryNotification['deliveryStatus'] {
  const lower = text.toLowerCase();
  if (/\bout\s+for\s+delivery\b/.test(lower)) return 'out_for_delivery';
  if (lower.includes('arriving today') || lower.includes('arriving')) return 'arriving_soon';
  if (
    lower.includes('ready to deliver') ||
    lower.includes('collect the order') ||
    lower.includes('confirm your availability')
  ) return 'scheduled';
  if (lower.includes('scheduled') || lower.includes('will be delivered')) return 'scheduled';
  if (lower.includes('delivered')) return 'delivered';
  if (lower.includes('failed') || lower.includes('could not deliver')) return 'failed';
  return 'initiated';
}

function getStartTime(text: string) {
  const first = extractTimeWindow(text).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!first?.[1]) return {hour: 9, minute: 0};
  const rawHour = Number(first[1]);
  const suffix = String(first[3] || '').toUpperCase();
  const hour =
    suffix === 'PM' && rawHour < 12
      ? rawHour + 12
      : suffix === 'AM' && rawHour === 12
        ? 0
        : rawHour;
  return {hour, minute: Number(first[2] || 0)};
}

function withLocalTime(date: Date, time: {hour: number; minute: number}) {
  const next = new Date(date);
  next.setHours(time.hour, time.minute, 0, 0);
  return next;
}

function monthToIndex(value: string) {
  return [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].findIndex(month => value.startsWith(month));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
