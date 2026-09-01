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

const EXTENSIONS = {
  'audio/webm':'webm',
  'audio/ogg':'ogg',
  'audio/wav':'wav',
  'audio/x-wav':'wav',
  'audio/mpeg':'mp3',
  'audio/mp4':'m4a',
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed('POST');
  try {
    assertSameOrigin(event);
    requireSession(event);
    const apiKey = env('OPENAI_API_KEY');
    if (!apiKey) throw new HttpError(503, 'Reliable Windows transcription is not enabled yet. Add OPENAI_API_KEY in Netlify, or use browser dictation/typing.');
    const body = parseBody(event), audioDataUrl = String(body.audioDataUrl || '');
    const match = audioDataUrl.match(/^data:(audio\/(?:webm|ogg|wav|x-wav|mpeg|mp4))(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw new HttpError(400, 'The browser did not send a supported audio recording');
    if (audioDataUrl.length > 6_000_000) throw new HttpError(413, 'The recording is too long. Record a shorter intake.');
    const mime = match[1].toLowerCase(), bytes = Buffer.from(match[2], 'base64');
    if (bytes.length < 800) throw new HttpError(400, 'The recording did not contain usable audio');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type:mime }), `hattan-intake.${EXTENSIONS[mime] || 'webm'}`);
    form.append('model', env('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe'));
    form.append('language', 'en');
    form.append('prompt', 'Hattan Cleaners dry cleaning intake. Vocabulary: dry cleaning, wash and fold, laundered shirts, wash and press, shirt on hanger, boxed shirts, starch, no starch, alterations, tailoring, press only, no charge, silk, cashmere, wool, linen, rayon, viscose, crease, no crease, black bag, white bag, low dry, no softener, fragrance free, separate darks and whites, separate ticket, rush. Preserve garment quantities, colors, pounds, due dates and the phrase separate ticket.');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:'POST', headers:{ Authorization:`Bearer ${apiKey}` }, body:form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(response.status >= 500 ? 502 : 400, payload?.error?.message || 'The transcription service could not process this recording');
    const transcript = String(payload?.text || '').trim();
    if (!transcript) throw new HttpError(422, 'No speech was found in the recording');
    return json(200, { ok:true, transcript });
  } catch (error) { return handleError(error); }
};
