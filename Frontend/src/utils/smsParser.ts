import {logs} from '../services/logs';

export type ParsedDeliverySms = {
  text: string;
  company: string;
  trackingId: string | null;
  smsId: string | null;
  smsDate: number | null;
  sender: string | null;
};

export type DeliverySmsMatchDebug = {
  matched: boolean;
  reason:
    | 'otp'
    | 'awb'
    | 'delivery_keyword'
    | 'tracking_with_parcel_context'
    | 'tracking_with_brand_context'
    | 'sender_with_delivery_context'
    | 'excluded_non_delivery'
    | 'empty_body'
    | 'no_relevant_signal';
  trackingId: string | null;
};

const OTP_PATTERN = /\botp\b(?:\s*(?:is|:|-|for))?\s*([0-9]{4,8})?\b/i;
const AWB_PATTERN =
  /\b(?:awb|airway\s*bill|waybill)(?:\s*(?:no|number|id))?\b/i;
const PARCEL_TRACKING_PATTERN =
  /\b(?:parcel|package|shipment|tracking(?: id)?|track(?:ing)?(?: id| no| number)?|consignment|courier|awb|airway\s*bill|waybill|order(?: id| no| number)?|article(?: id| no| number)?|delivery code)\b/i;
const DELIVERY_KEYWORD_PATTERN =
  /\b(?:out\s+for\s+delivery|on\s+the\s+way|in\s+transit|arriving\s+(?:soon|today)|expected\s+to\s+(?:arrive|reach)|successfully\s+delivered|will\s+be\s+delivered|delivery\s+(?:partner|agent|associate|executive|boy|attempt|scheduled|rescheduled|failed|code|otp)|open\s+box\s+delivery|wish\s*master|waiting\s+at\s+your\s+address|share(?:\s+the)?\s+(?:otp|delivery\s+code)|accept\s+your\s+delivery|track\s+your\s+order|reach\s+you\s+today|reached\s+your\s+(?:hub|nearest\s+hub)|at\s+your\s+doorstep|ready\s+for\s+(?:dispatch|pickup)|return\s+pickup)\b/i;
const DELIVERY_CONTEXT_PATTERN =
  /\b(?:order|package|parcel|shipment|courier|delivery|track(?:ing)?|awb|airway\s*bill|waybill|consignment|article|rider|wish\s*master|executive)\b/i;
const DELIVERY_STATUS_PATTERN =
  /\b(?:deliver(?:y|ed|ing)|shipp(?:ed|ing)|dispatch(?:ed|ing)?|arriv(?:e|ed|ing|al)|reach(?:ed|es|ing)?|delay(?:ed)?|in\s+transit|on\s+the\s+way|expected|scheduled|rescheduled|pickup|doorstep)\b/i;
const LABELED_TRACKING_PATTERN =
  /\b(?:awb|airway\s*bill|waybill|tracking|track(?:ing)?\s*(?:id|no|number)|consignment|article|order\s*(?:id|no|number|#))\b/i;
const DELIVERY_BRAND_PATTERN =
  /\b(?:amazon|flipkart|myntra|ekart|shadowfax|xpress\s*bees|blitz|delhivery|savana|tira|ajio|meesho|nykaa|zara|marks?\s*&?\s*spencer|trendyol|blue\s*dart|bluedart|dtdc|ecom\s*express|shiprocket|fedex|dhl|india\s*post|speed\s*post|firstcry|tatacliq|tata\s*cliq|purplle|jiomart|jio\s*mart|bigbasket|blinkit|zepto|swiggy|porter|dunzo|dvaarikart)\b/i;
const NON_DELIVERY_PATTERN =
  /\b(?:login|log in|sign[ -]?up|signup|register|registration|verify(?: your)? account|password|passcode|transaction|bank transfer|credited|debited|a\/c|account\b|netbanking|upi|vpa\b|beneficiary|loan|emi|wallet|kyc|insurance|statement|balance|avlbal|card verification|cvv|refund initiated)\b/i;
const MULTIPART_WINDOW_MS = 250;

type SmsCandidate = {
  body: string;
  smsId: string | null;
  smsDate: number | null;
  sender: string | null;
  sourceIndex: number;
};

const COMPANY_PATTERNS: ReadonlyArray<{
  name: string;
  pattern: RegExp;
}> = [
  {name: 'Amazon', pattern: /\bamazon\b/i},
  {name: 'Flipkart', pattern: /\bflipkart\b/i},
  {name: 'Myntra', pattern: /\bmyntra\b/i},
  {name: 'Ekart', pattern: /\bekart\b/i},
  {name: 'Shadowfax', pattern: /\b(?:shadowfax|sdfx)\b/i},
  {name: 'Xpressbees', pattern: /\b(?:xpress\s*bees|xpressbees|xb\s*rider)\b/i},
  {name: 'Blitz', pattern: /\bblitz\b/i},
  {name: 'Delhivery', pattern: /\bdelhivery\b/i},
  {name: 'Blue Dart', pattern: /\b(?:blue\s*dart|bluedart)\b/i},
  {name: 'DTDC', pattern: /\bdtdc\b/i},
  {name: 'Ecom Express', pattern: /\becom\s*express\b/i},
  {name: 'Shiprocket', pattern: /\bshiprocket\b/i},
  {name: 'FedEx', pattern: /\bfedex\b/i},
  {name: 'DHL', pattern: /\bdhl\b/i},
  {name: 'India Post', pattern: /\b(?:india\s*post|speed\s*post)\b/i},
  {name: 'Savana', pattern: /\bsavana\b/i},
  {name: 'Ajio', pattern: /\bajio\b/i},
  {name: 'Nykaa', pattern: /\bnykaa\b/i},
  {name: 'Tira', pattern: /\btira\b/i},
  {name: 'Meesho', pattern: /\bmeesho\b/i},
  {name: 'Zara', pattern: /\bzara\b/i},
  {name: 'Dvaarikart', pattern: /\bdvaarikart\b/i},
];

const SENDER_COMPANY_ALIAS_GROUPS: ReadonlyArray<{
  company: string;
  aliases: ReadonlyArray<string>;
}> = [
  {company: 'Amazon', aliases: ['AMAZON', 'AMZN', 'AMAZN', 'AMZNIN']},
  {
    company: 'Flipkart',
    aliases: ['FLPKRT', 'FKRT', 'FKART', 'FLIPKART', 'FLIPLAKRT'],
  },
  {company: 'Myntra', aliases: ['MYNTRA', 'MNTRA', 'MYNT']},
  {company: 'Meesho', aliases: ['MEESHO', 'MSHO', 'MSHOPE']},
  {company: 'Ajio', aliases: ['AJIO', 'AJIORT']},
  {company: 'Nykaa', aliases: ['NYKAA']},
  {company: 'Tata Cliq', aliases: ['TATACLIQ', 'TCLIQ', 'CLIQ']},
  {company: 'JioMart', aliases: ['JIOMART', 'JMART']},
  {company: 'Croma', aliases: ['CROMA', 'CRMIND']},
  {company: 'Reliance Digital', aliases: ['RELDIG', 'RDIGITAL']},
  {company: 'FirstCry', aliases: ['FIRSTCRY', 'FCRY']},
  {company: 'Pepperfry', aliases: ['PEPPERFRY', 'PFRY']},
  {company: 'Lenskart', aliases: ['LENSKART']},
  {company: 'boAt', aliases: ['BOAT', 'IMBOAT']},
  {company: 'Noise', aliases: ['NOISE', 'GONOISE']},
  {
    company: 'Delhivery',
    aliases: ['DELHIVERY', 'DLHVRY', 'DLVRY', 'DELVRY'],
  },
  {company: 'Ekart', aliases: ['EKART', 'EKRT', 'EKLOG', 'EKLGT']},
  {
    company: 'Shadowfax',
    aliases: ['SHADOWFAX', 'SHDFAX', 'SHDWFX', 'SDFX', 'SFX'],
  },
  {
    company: 'Xpressbees',
    aliases: ['XPRESSBEES', 'XPBEES', 'XBEE', 'XPB'],
  },
  {
    company: 'Blue Dart',
    aliases: ['BLUEDART', 'BLUDRT', 'BDART', 'BLDART'],
  },
  {company: 'DTDC', aliases: ['DTDC', 'DTDCCS']},
  {
    company: 'Ecom Express',
    aliases: ['ECOMEXP', 'ECOM', 'ECEXP', 'ECOMEX'],
  },
  {company: 'DHL', aliases: ['DHL', 'DHLIND', 'DHLXPR']},
  {company: 'FedEx', aliases: ['FEDEX', 'FDX']},
  {company: 'UPS', aliases: ['UPS', 'UPSIND']},
  {company: 'Aramex', aliases: ['ARAMEX', 'ARMX']},
  {
    company: 'India Post',
    aliases: ['INDPOST', 'INDIAPOST', 'DOP', 'POST'],
  },
  {company: 'Gati', aliases: ['GATI', 'GATIEXP']},
  {
    company: 'Safexpress',
    aliases: ['SAFEXP', 'SAFEXPRESS', 'SAFEEXPRESS'],
  },
  {company: 'Shiprocket', aliases: ['SHIPROCKET', 'SHIPRKT']},
  {company: 'NimbusPost', aliases: ['NIMBUSPOST', 'NPOST']},
  {company: 'Pickrr', aliases: ['PICKRR', 'PKRR']},
  {company: 'Loadshare', aliases: ['LOADSHARE', 'LDSHR']},
  {company: 'Porter', aliases: ['PORTER', 'PTR']},
  {company: 'Borzo', aliases: ['BORZO', 'WEFAST']},
  {
    company: 'Mahindra Logistics',
    aliases: ['MLL', 'MAHLOG', 'MAHINDRALOGISTICS'],
  },
  {company: 'Swiggy', aliases: ['SWIGGY', 'SWGY']},
  {company: 'Zomato', aliases: ['ZOMATO', 'ZMT']},
  {company: 'Blinkit', aliases: ['BLINKIT', 'BLKT']},
  {company: 'Zepto', aliases: ['ZEPTO', 'ZPTO']},
  {company: 'BigBasket', aliases: ['BIGBASKET', 'BBASKET', 'BBNOW']},
  {company: 'Netmeds', aliases: ['NETMEDS', 'NTMDS']},
  {company: 'PharmEasy', aliases: ['PHARMEASY', 'PHRM']},
  {company: 'Apollo Pharmacy', aliases: ['APOLLO', 'APLPHR']},
  {company: 'DotZot', aliases: ['DOTZOT']},
  {company: 'Rivigo', aliases: ['RIVIGO']},
  {company: 'TCI', aliases: ['TCI']},
  {company: 'Pro Courier', aliases: ['PROCOURIER']},
  {company: 'BlackBuck', aliases: ['BLACKBUCK']},
];

const SENDER_COMPANY_BY_ALIAS = new Map<string, string>(
  SENDER_COMPANY_ALIAS_GROUPS.flatMap(({company, aliases}) =>
    aliases.map(alias => [alias, company] as const),
  ),
);

function getBodyText(message: unknown): string | null {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return null;
  const body = (message as { body?: unknown }).body;
  return typeof body === 'string' ? body : null;
}

function getSmsId(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const id = (message as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

function getSmsDate(message: unknown): number | null {
  if (!message || typeof message !== 'object') return null;
  const date = (message as { date?: unknown }).date;
  return typeof date === 'number' && Number.isFinite(date) ? date : null;
}

function getSmsSender(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const address = (message as { address?: unknown }).address;
  return typeof address === 'string' && address.trim().length > 0
    ? address.trim()
    : null;
}

function normalizeSmsText(body: string): string {
  return body
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSenderId(sender: string): string {
  return sender
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]{2}-/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function getSenderCompany(sender: string | null): string | null {
  if (!sender) return null;
  return SENDER_COMPANY_BY_ALIAS.get(normalizeSenderId(sender)) ?? null;
}

function detectCompany(body: string, sender: string | null): string {
  const senderCompany = getSenderCompany(sender);
  if (senderCompany) return senderCompany;

  for (const company of COMPANY_PATTERNS) {
    if (company.pattern.test(body)) return company.name;
  }

  if (sender) {
    const normalizedSender = sender.replace(/^[A-Z]{2}[-\s]/i, '');
    for (const company of COMPANY_PATTERNS) {
      if (company.pattern.test(normalizedSender)) return company.name;
    }
  }

  return 'Unknown';
}

function extractTrackingId(body: string): string | null {
  const labeled = body.match(
    /\b(?:awb|airway\s*bill|waybill|tracking(?: id)?|track(?:ing)?(?: id| no| number)?|shipment(?: id)?|consignment(?: id| no| number)?|article(?: id| no| number)?|order(?: id| no| number|\s*#))\s*[:#-]?\s*((?=[A-Z0-9-]{6,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+)\b/i,
  );
  if (labeled?.[1]) return labeled[1];

  const candidates = body.match(
    /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/gi,
  );
  if (!candidates) return null;

  return (
    candidates.find(candidate => /[A-Z]/i.test(candidate)) ??
    candidates.find(candidate => candidate.replace(/\D/g, '').length >= 11) ??
    null
  );
}

function isCommercialSender(sender: string | null): boolean {
  if (!sender) return false;
  const normalized = sender.replace(/\s+/g, '').trim();
  if (/^\+?\d[\d()-]{5,}$/.test(normalized)) return false;
  return /[A-Z]/i.test(normalized) && /[A-Z0-9]{3,}/i.test(normalized);
}

function isRecognizedDeliverySender(sender: string | null): boolean {
  return getSenderCompany(sender) != null;
}

function isPersonalNumericSender(sender: string | null): boolean {
  if (!sender) return false;
  return /^\+?\d[\d\s()-]{5,}$/.test(sender.trim());
}

function hasDeliveryContext(body: string, sender: string | null): boolean {
  const hasParcelContext = PARCEL_TRACKING_PATTERN.test(body);
  const hasStatus = DELIVERY_STATUS_PATTERN.test(body);
  const hasBrand = DELIVERY_BRAND_PATTERN.test(body);

  return (
    DELIVERY_KEYWORD_PATTERN.test(body) ||
    AWB_PATTERN.test(body) ||
    (hasParcelContext && (hasStatus || OTP_PATTERN.test(body))) ||
    (hasBrand &&
      (DELIVERY_CONTEXT_PATTERN.test(body) ||
        hasStatus ||
        OTP_PATTERN.test(body))) ||
    ((isRecognizedDeliverySender(sender) || isCommercialSender(sender)) &&
      hasParcelContext &&
      (hasStatus || OTP_PATTERN.test(body)))
  );
}

function isExplicitlyNonDelivery(body: string): boolean {
  return NON_DELIVERY_PATTERN.test(body);
}

export function explainDeliverySmsMatch(
  body: string | null,
  sender: string | null = null,
): DeliverySmsMatchDebug {
  if (!body) {
    return {
      matched: false,
      reason: 'empty_body',
      trackingId: null,
    };
  }

  const normalizedBody = normalizeSmsText(body);
  const hasContext = hasDeliveryContext(normalizedBody, sender);
  const hasStrongTransactionalEvidence =
    AWB_PATTERN.test(normalizedBody) ||
    LABELED_TRACKING_PATTERN.test(normalizedBody) ||
    DELIVERY_BRAND_PATTERN.test(normalizedBody) ||
    (OTP_PATTERN.test(normalizedBody) &&
      PARCEL_TRACKING_PATTERN.test(normalizedBody)) ||
    isRecognizedDeliverySender(sender) ||
    isCommercialSender(sender);

  if (isExplicitlyNonDelivery(normalizedBody) && !hasContext) {
    return {
      matched: false,
      reason: 'excluded_non_delivery',
      trackingId: extractTrackingId(normalizedBody),
    };
  }

  if (OTP_PATTERN.test(normalizedBody)) {
    if (!hasContext || isExplicitlyNonDelivery(normalizedBody)) {
      return {
        matched: false,
        reason: 'no_relevant_signal',
        trackingId: extractTrackingId(normalizedBody),
      };
    }
    return {
      matched: true,
      reason: 'otp',
      trackingId: extractTrackingId(normalizedBody),
    };
  }
  if (AWB_PATTERN.test(normalizedBody)) {
    if (
      isExplicitlyNonDelivery(normalizedBody) &&
      !DELIVERY_CONTEXT_PATTERN.test(normalizedBody)
    ) {
      return {
        matched: false,
        reason: 'excluded_non_delivery',
        trackingId: extractTrackingId(normalizedBody),
      };
    }
    return {
      matched: true,
      reason: 'awb',
      trackingId: extractTrackingId(normalizedBody),
    };
  }
  if (DELIVERY_KEYWORD_PATTERN.test(normalizedBody)) {
    if (
      isExplicitlyNonDelivery(normalizedBody) &&
      !PARCEL_TRACKING_PATTERN.test(normalizedBody)
    ) {
      return {
        matched: false,
        reason: 'excluded_non_delivery',
        trackingId: extractTrackingId(normalizedBody),
      };
    }
    if (isPersonalNumericSender(sender) && !hasStrongTransactionalEvidence) {
      return {
        matched: false,
        reason: 'no_relevant_signal',
        trackingId: extractTrackingId(normalizedBody),
      };
    }
    return {
      matched: true,
      reason: 'delivery_keyword',
      trackingId: extractTrackingId(normalizedBody),
    };
  }

  const trackingId = extractTrackingId(normalizedBody);
  if (
    DELIVERY_STATUS_PATTERN.test(normalizedBody) &&
    (PARCEL_TRACKING_PATTERN.test(normalizedBody) ||
      (DELIVERY_BRAND_PATTERN.test(normalizedBody) &&
        DELIVERY_CONTEXT_PATTERN.test(normalizedBody)))
  ) {
    if (isPersonalNumericSender(sender) && !hasStrongTransactionalEvidence) {
      return {
        matched: false,
        reason: 'no_relevant_signal',
        trackingId,
      };
    }
    return {
      matched: true,
      reason: 'delivery_keyword',
      trackingId,
    };
  }
  if (
    trackingId != null &&
    PARCEL_TRACKING_PATTERN.test(normalizedBody) &&
    DELIVERY_STATUS_PATTERN.test(normalizedBody)
  ) {
    return {
      matched: true,
      reason: 'tracking_with_parcel_context',
      trackingId,
    };
  }
  if (trackingId != null && DELIVERY_BRAND_PATTERN.test(normalizedBody)) {
    return {
      matched: true,
      reason: 'tracking_with_brand_context',
      trackingId,
    };
  }
  if (
    (isRecognizedDeliverySender(sender) || isCommercialSender(sender)) &&
    DELIVERY_CONTEXT_PATTERN.test(normalizedBody) &&
    (DELIVERY_STATUS_PATTERN.test(normalizedBody) || trackingId != null)
  ) {
    return {
      matched: true,
      reason: 'sender_with_delivery_context',
      trackingId,
    };
  }

  return {
    matched: false,
    reason: 'no_relevant_signal',
    trackingId,
  };
}

function createSmsCandidate(
  message: unknown,
  sourceIndex: number,
): SmsCandidate | null {
  const body = getBodyText(message);
  if (!body || body.trim().length === 0) return null;

  return {
    body: body.trim(),
    smsId: getSmsId(message),
    smsDate: getSmsDate(message),
    sender: getSmsSender(message),
    sourceIndex,
  };
}

function mergeMultipartBodies(candidates: SmsCandidate[]): string {
  const uniqueBodies = Array.from(
    new Set(candidates.map(candidate => candidate.body.trim()).filter(Boolean)),
  );
  const longestBody = uniqueBodies.reduce(
    (longest, body) => (body.length > longest.length ? body : longest),
    '',
  );

  if (
    longestBody &&
    uniqueBodies.every(
      body => body === longestBody || longestBody.includes(body),
    )
  ) {
    return longestBody;
  }

  return uniqueBodies.join(' ');
}

function coalesceMultipartMessages(
  messages: ReadonlyArray<unknown>,
): SmsCandidate[] {
  const candidates = messages
    .map((message, index) => createSmsCandidate(message, index))
    .filter((candidate): candidate is SmsCandidate => candidate != null);
  const consumed = new Set<number>();
  const result: SmsCandidate[] = [];

  candidates.forEach(candidate => {
    if (consumed.has(candidate.sourceIndex)) return;

    const group = candidates.filter(other => {
      if (consumed.has(other.sourceIndex)) return false;
      if (
        !candidate.sender ||
        candidate.smsDate == null ||
        other.sender !== candidate.sender ||
        other.smsDate == null
      ) {
        return other.sourceIndex === candidate.sourceIndex;
      }
      return Math.abs(other.smsDate - candidate.smsDate) <= MULTIPART_WINDOW_MS;
    });

    group.forEach(item => consumed.add(item.sourceIndex));
    const metadataSource =
      group.find(item => item.smsId != null) ?? group[0] ?? candidate;
    const datedItems = group
      .map(item => item.smsDate)
      .filter((date): date is number => date != null);
    result.push({
      body: mergeMultipartBodies(group),
      smsId: metadataSource.smsId,
      smsDate: datedItems.length > 0 ? Math.max(...datedItems) : null,
      sender: candidate.sender,
      sourceIndex: candidate.sourceIndex,
    });
  });

  return result;
}

export const parseDeliverySMS = (
  messages: ReadonlyArray<unknown>,
): ParsedDeliverySms[] => {
  const results: ParsedDeliverySms[] = [];
  const candidates = coalesceMultipartMessages(messages);

  for (const candidate of candidates) {
    try {
      const match = explainDeliverySmsMatch(candidate.body, candidate.sender);
      if (!match.matched) continue;

      results.push({
        text: candidate.body,
        company: detectCompany(candidate.body, candidate.sender),
        trackingId: match.trackingId,
        smsId: candidate.smsId,
        smsDate: candidate.smsDate,
        sender: candidate.sender,
      });
    } catch (error) {
      logs.error('[smsParser] Failed to parse SMS candidate', {
        sender: candidate.sender,
        smsId: candidate.smsId,
        error,
      });
    }
  }

  logs.info('[smsParser] Delivery SMS parsing complete', {
    inputCount: messages.length,
    candidateCount: candidates.length,
    matchedCount: results.length,
  });

  return results;
};
