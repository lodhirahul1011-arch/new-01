const axios = require('axios');
const { env } = require('../config/env');

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    order_id: { type: ['string', 'null'] },
    awb_number: { type: ['string', 'null'] },
    delivery_date: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    platform: { type: ['string', 'null'] },
    courier_company: { type: ['string', 'null'] },
    seller_name: { type: ['string', 'null'] },
    otp: { type: ['string', 'null'] },
  },
  required: [
    'order_id',
    'awb_number',
    'delivery_date',
    'title',
    'platform',
    'courier_company',
    'seller_name',
    'otp',
  ],
  additionalProperties: false,
};

// const SYSTEM_PROMPT = `You are an information extraction engine for English delivery-related SMS.

// Your task:
// Extract only the requested fields from the SMS and return exactly one valid JSON object.

// Output schema:
// {
//   "order_id": null,
//   "awb_number": null,
//   "delivery_date": null,
//   "title": null,
//   "platform": null,
//   "courier_company": null,
//   "seller_name": null,
//   "otp": null
// }

// Strict rules:
// - Return JSON only.
// - Do not add markdown.
// - Do not add explanation.
// - Do not add extra keys.
// - If a value is missing, unclear, or not explicitly present, return null.
// - Never guess.
// - Never normalize dates beyond what is written.
// - delivery_date must preserve the wording exactly as written in SMS, such as: "arriving today", "today", "tomorrow", "next day", "15 Apr", "15 April", "by 9 PM today".
// - order_id means order/reference/order number only.
// - awb_number means shipment/tracking/AWB number only.
// - title means product/order item title only, not courier name or marketing text.
// - platform means the most relevant branded platform explicitly indicated in the SMS. Prefer the delivery/logistics platform when a courier is named in the sender or message, otherwise return the merchant/app brand.
// - courier_company means the delivery/logistics company handling the package, such as Ekart, XpressBees, Shadowfax, Delhivery, Blitz, Amazon Logistics, Flipkart Delivery. If no courier company is explicit, return null.
// - seller_name means the merchant/store/brand the order is from, such as Myntra, AJIO, Amazon, Nykaa, Tira Beauty, Zara. If not explicit, return null.
// - otp means delivery OTP only. Ignore unrelated login/payment OTP unless the SMS clearly ties it to delivery or package handover.
// - If multiple candidate values exist for the same field, choose the one most explicitly labeled.
// - If both order_id and awb_number appear, keep them separate.`;
const SYSTEM_PROMPT = `You are a strict SMS information extraction engine for delivery, shipment, ecommerce, courier, and order-status messages.

Return exactly one valid JSON object matching this schema:
{
  "order_id": null,
  "awb_number": null,
  "delivery_date": null,
  "title": null,
  "platform": null,
  "courier_company": null,
  "seller_name": null,
  "otp": null
}

Rules:
- Output JSON only. No markdown, no explanation, no text before or after JSON.
- Use only information explicitly present in the SMS.
- If missing, ambiguous, promotional, or inferred, return null.
- Do not guess company names from links, sender IDs, domains, or context unless clearly written as a brand/company in the SMS.
- Preserve original wording for extracted values. Do not translate or normalize.
- Do not normalize dates. Keep dates exactly as written, for example "today", "tomorrow", "by 9 PM today", "15 Apr", "expected by Monday".
- Extract delivery_date only when the SMS talks about delivery/arrival/out-for-delivery/expected delivery/pickup schedule.
- order_id means order id/reference id/purchase id only. Prefer labels like order, order id, order no, ref, reference.
- awb_number means AWB/tracking/shipment/waybill/consignment number only. Prefer labels like AWB, tracking ID, shipment ID, waybill, consignment.
- If both order_id and awb_number are present, keep them separate.
- title means product/item/order title only. Do not use courier names, generic words like "package", "shipment", "order", or marketing text.
- platform means the app/website/service explicitly responsible for the order or delivery experience, for example Amazon, Flipkart, Myntra, Swiggy Instamart, Blinkit, Meesho, Nykaa, Delhivery, Ekart.
- courier_company means the logistics/delivery company explicitly handling shipment, for example Delhivery, Ekart, XpressBees, Ecom Express, Shadowfax, Blue Dart, DTDC, Amazon Logistics.
- seller_name means merchant/store/brand/seller from whom the order is purchased, for example Zara, Tira Beauty, Nykaa, AJIO, Myntra, Amazon Seller Services. If only platform is present, do not copy it to seller_name unless SMS clearly says seller/store/merchant.
- otp means delivery OTP/handover code only. Ignore login OTP, payment OTP, bank OTP, verification OTP, cancellation OTP, or refund OTP unless clearly linked to delivery/package handover.
- If multiple values exist for same field, choose the most explicitly labeled one.
- Remove surrounding punctuation from values but keep internal symbols, spaces, hyphens, and case.
- Never add extra keys.
- All keys must always be present.`;
function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeOutput(payload) {
  return {
    order_id: normalizeNullableString(payload?.order_id),
    awb_number: normalizeNullableString(payload?.awb_number),
    delivery_date: normalizeNullableString(payload?.delivery_date),
    title: normalizeNullableString(payload?.title),
    platform: normalizeNullableString(payload?.platform),
    courier_company: normalizeNullableString(payload?.courier_company),
    seller_name: normalizeNullableString(payload?.seller_name),
    otp: normalizeNullableString(payload?.otp),
  };
}

function parseJsonFromModelOutput(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }

  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Model returned empty response');
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced);
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('Model did not return valid JSON');
  }
}

async function extractDeliveryContext(smsText) {
  const text = String(smsText || '').trim();
  if (!text) {
    const err = new Error('smsText is required');
    err.status = 400;
    err.code = 'SMS_TEXT_REQUIRED';
    throw err;
  }

  const baseURL = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const timeout = Number(env.OLLAMA_TIMEOUT_MS || 30000);
  const numCtx = Number(env.OLLAMA_NUM_CTX || 2048);
  const keepAlive = env.OLLAMA_KEEP_ALIVE || '15m';

  const prompt = `Extract the fields from this SMS and return valid JSON only.\n\nSchema:\n${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}\n\nSMS:\n${text}`;

  let response;
  try {
    response = await axios.post(
      `${baseURL}/api/generate`,
      {
        model,
        system: SYSTEM_PROMPT,
        prompt,
        format: EXTRACTION_SCHEMA,
        stream: false,
        think: false,
        keep_alive: keepAlive,
        options: {
          temperature: 0,
          num_ctx: numCtx,
        },
      },
      {
        timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    const status = Number(error?.response?.status || 502);
    const detail = error?.response?.data || error?.message || 'Unknown Ollama error';
    const err = new Error(`Ollama request failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    err.status = status;
    err.code = 'OLLAMA_REQUEST_FAILED';
    throw err;
  }

  const parsed = parseJsonFromModelOutput(response?.data?.response);
  const normalized = normalizeOutput(parsed);

  return {
    model,
    smsText: text,
    extracted: normalized,
    usage: {
      prompt_eval_count: response?.data?.prompt_eval_count ?? null,
      eval_count: response?.data?.eval_count ?? null,
      total_duration: response?.data?.total_duration ?? null,
      load_duration: response?.data?.load_duration ?? null,
    },
  };
}

module.exports = {
  extractDeliveryContext,
  EXTRACTION_SCHEMA,
};
