import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  buildClearAuthCookie,
  issueAuthToken,
  parseCookie,
  verifyAuthToken,
} from '../lib/auth.js';

interface ApiRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  headers: {
    cookie?: string;
  };
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
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

async function readJson(req: ApiRequest) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
