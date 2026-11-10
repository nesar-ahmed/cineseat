import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection (guideline section 11). The session token is httpOnly, so
 * the edge can only check that the cookie *exists* — real verification stays
 * with the API's JwtAuthGuard, and the panel re-checks GET /auth/me in the
 * browser. This just keeps signed-out visitors from landing on an empty page.
 *
 * Keep this name in sync with AUTH_COOKIE_NAME in
 * apps/api/src/common/constants/session.ts (edge code cannot import from the API).
 */
const AUTH_COOKIE_NAME = 'cineseat_access';

const PROTECTED_PREFIXES = ['/account'];

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/account/:path*'],
};
