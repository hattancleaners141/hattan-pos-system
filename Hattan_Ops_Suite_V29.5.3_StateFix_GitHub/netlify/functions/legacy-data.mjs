// GET /.netlify/functions/legacy-data?f=directory | f=tickets-<0-f>
// Serves the CleanBase customer directory and ticket history to signed-in staff only.
// The same files are blocked from direct public download in _redirects.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleError, methodNotAllowed, requireSession, HttpError } from './lib/shared.mjs';

const FILES = {
  directory: 'legacy-v296/customer-directory.json',
  ...Object.fromEntries('0123456789abcdef'.split('').map(h => [`tickets-${h}`, `legacy-v294/tickets4y-${h}.json`])),
};
const here = path.dirname(fileURLToPath(import.meta.url));
const roots = () => [
  process.cwd(),
  path.join(process.cwd(), 'Hattan_Ops_Suite_V29.5.3_StateFix_GitHub'),
  process.env.LAMBDA_TASK_ROOT || '',
  path.join(process.env.LAMBDA_TASK_ROOT || '', 'Hattan_Ops_Suite_V29.5.3_StateFix_GitHub'),
  path.resolve(here, '..', '..'),
  path.resolve(here, '..', '..', '..'),
].filter(Boolean);
const cache = new Map();

function read(rel) {
  if (cache.has(rel)) return cache.get(rel);
  for (const root of roots()) {
    const p = path.join(root, rel);
    try { const body = fs.readFileSync(p, 'utf8'); cache.set(rel, body); return body; } catch (_) { /* try next */ }
  }
  throw new HttpError(404, 'Data file not found');
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed('GET');
  try {
    requireSession(event);
    const rel = FILES[String(event.queryStringParameters?.f || '')];
    if (!rel) throw new HttpError(400, 'Unknown data file');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
      body: read(rel),
    };
  } catch (error) { return handleError(error); }
};
