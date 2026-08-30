import {
  assertSameOrigin,
  env,
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  parseBody,
  requireSession,
} from './lib/shared.mjs';

const nullableString = { type:['string', 'null'] };
const nullableNumber = { type:['number', 'null'] };

const importSchema = {
  type:'object',
  additionalProperties:false,
  required:['customers', 'tickets', 'daily_revenue', 'warnings'],
  properties:{
    customers:{
      type:'array',
      items:{
        type:'object', additionalProperties:false,
        required:['customer_number', 'name', 'phone', 'email', 'address_line1', 'apartment', 'city', 'state', 'postal_code', 'balance', 'store_credit', 'memo', 'preferences', 'default_fulfillment'],
        properties:{
          customer_number:nullableString, name:nullableString, phone:nullableString, email:nullableString,
          address_line1:nullableString, apartment:nullableString, city:nullableString, state:nullableString,
          postal_code:nullableString, balance:nullableNumber, store_credit:nullableNumber, memo:nullableString,
          preferences:nullableString, default_fulfillment:nullableString,
        },
      },
    },
    tickets:{
      type:'array',
      items:{
        type:'object', additionalProperties:false,
        required:['ticket_number', 'customer_number', 'customer_name', 'created_at', 'due_date', 'status', 'total', 'balance', 'service', 'items', 'notes'],
        properties:{
          ticket_number:nullableString, customer_number:nullableString, customer_name:nullableString,
          created_at:nullableString, due_date:nullableString, status:nullableString, total:nullableNumber,
          balance:nullableNumber, service:nullableString, items:nullableString, notes:nullableString,
        },
      },
    },
    daily_revenue:{
      type:'array',
      items:{
        type:'object', additionalProperties:false,
        required:['date', 'gross', 'net', 'cash', 'card', 'refunds'],
        properties:{ date:nullableString, gross:nullableNumber, net:nullableNumber, cash:nullableNumber, card:nullableNumber, refunds:nullableNumber },
      },
    },
    warnings:{ type:'array', items:{ type:'string' } },
  },
};

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  return (response?.output || []).flatMap(item => item?.content || []).map(item => item?.text || '').join('');
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    requireSession(event, true);
    const apiKey = env('OPENAI_API_KEY');
    if (!apiKey) throw new HttpError(503, 'Screenshot import is not enabled yet. Add OPENAI_API_KEY in Netlify, or import a CSV/JSON export without it.');
    const body = parseBody(event), sourceName = String(body.sourceName || 'legacy POS image').slice(0, 160);
    const imageDataUrl = String(body.imageDataUrl || '');
    if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUrl)) throw new HttpError(400, 'Upload a PNG or JPG image');
    if (imageDataUrl.length > 6_000_000) throw new HttpError(413, 'The prepared image is too large. Crop it and try again.');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model:env('OPENAI_IMPORT_MODEL', 'gpt-4.1-mini'),
        store:false,
        max_output_tokens:5000,
        input:[{
          role:'user',
          content:[
            { type:'input_text', text:`Extract only clearly visible legacy dry-cleaning POS data from ${sourceName}. Do not guess obscured text or infer missing values. Use null for unreadable fields. Preserve customer/ticket numbers, signs on balances and credits, dates, phone numbers, apartment/unit, notes, preferences, delivery/pickup default, ticket status, totals and revenue. A screen may contain many table rows: return every legible row. Put ambiguity and truncated columns in warnings. Never return payment-card numbers, PINs, passwords or authentication secrets.` },
            { type:'input_image', image_url:imageDataUrl, detail:'high' },
          ],
        }],
        text:{ format:{ type:'json_schema', name:'hattan_legacy_import_review', strict:true, schema:importSchema } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(response.status >= 500 ? 502 : 400, payload?.error?.message || 'The screenshot extractor could not read this image');
    const text = outputText(payload);
    if (!text) throw new HttpError(422, 'No readable legacy data was found in that image');
    let extracted;
    try { extracted = JSON.parse(text); }
    catch { throw new HttpError(502, 'The screenshot extractor returned an unreadable review draft'); }
    return json(200, { ok:true, extracted, reviewRequired:true });
  } catch (error) { return handleError(error); }
};
