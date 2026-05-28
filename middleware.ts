import { next } from '@vercel/functions';
import { AUTH_COOKIE_NAME, parseCookie, verifyAuthToken } from './lib/auth';

const PUBLIC_FILE = /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|map|txt|json)$/i;

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isPublicPath(pathname)) return next();

  const authed = await verifyAuthToken(parseCookie(request.headers.get('cookie'), AUTH_COOKIE_NAME));
  if (authed) return next();

  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', url);
  loginUrl.searchParams.set('next', `${pathname}${url.search}`);
  return Response.redirect(loginUrl, 302);
}

function isPublicPath(pathname: string) {
  return pathname === '/login'
    || pathname === '/api/auth'
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/images/')
    || PUBLIC_FILE.test(pathname);
}

export const config = {
  matcher: '/(.*)',
};
