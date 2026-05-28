import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  buildClearAuthCookie,
  issueAuthToken,
  parseCookie,
  verifyAuthToken,
} from '../lib/auth';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') {
    const ok = await verifyAuthToken(parseCookie(req.headers.cookie, AUTH_COOKIE_NAME));
    sendJson(res, ok ? 200 : 401, { ok });
    return;
  }

  if (req.method === 'POST') {
    const configuredPasscode = process.env.APP_PASSCODE;
    if (!configuredPasscode) {
      sendJson(res, 500, { error: 'APP_PASSCODE is not configured.' });
      return;
    }

    const body = await readJson(req);
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';

    if (passcode !== configuredPasscode) {
      sendJson(res, 401, { error: 'Invalid passcode.' });
      return;
    }

    const token = await issueAuthToken();
    res.setHeader('Set-Cookie', buildAuthCookie(token));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildClearAuthCookie());
    sendJson(res, 200, { ok: true });
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
