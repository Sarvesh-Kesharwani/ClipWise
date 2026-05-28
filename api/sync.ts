import type { IncomingMessage, ServerResponse } from 'node:http';
import { AUTH_COOKIE_NAME, parseCookie, verifyAuthToken } from '../lib/auth';
import { loadAppState, saveAppState } from '../lib/supabaseState';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const authed = await verifyAuthToken(parseCookie(req.headers.cookie, AUTH_COOKIE_NAME));
  if (!authed) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const row = await loadAppState();
      if (!row) {
        sendJson(res, 404, { error: 'No Supabase backup found.' });
        return;
      }
      sendJson(res, 200, { data: row.data, savedAt: row.saved_at });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Sync load failed.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || !('data' in body)) {
      sendJson(res, 400, { error: 'Missing app data.' });
      return;
    }

    const savedAt = typeof body.savedAt === 'number' && Number.isFinite(body.savedAt)
      ? Math.round(body.savedAt)
      : Date.now();

    try {
      const row = await saveAppState(body.data, savedAt);
      sendJson(res, 200, { data: row.data, savedAt: row.saved_at });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Sync save failed.' });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
