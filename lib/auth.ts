import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE_NAME = 'app_auth';
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a 32+ character value.');
  }
  return encoder.encode(secret);
}

export async function issueAuthToken() {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${AUTH_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAuthToken(token: string | undefined | null) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.ok === true;
  } catch {
    return false;
  }
}

export function parseCookie(header: string | undefined | null, name: string) {
  if (!header) return null;
  const cookies = header.split(';');
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (key === name) return valueParts.join('=');
  }
  return null;
}

export function buildAuthCookie(token: string) {
  return [
    `${AUTH_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${AUTH_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function buildClearAuthCookie() {
  return [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}
