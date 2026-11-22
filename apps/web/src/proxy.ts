import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_ROUTES } from './features/account/links';

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

// `/admin` also needs the ADMIN role: the admin frame checks it, the API enforces it.
const PROTECTED_PREFIXES = ['/account', '/checkout', '/admin'];

/** `?tab=` values of the old tabbed account panel, and the pages that replaced them. */
const LEGACY_TABS: Record<string, string> = {
  bookings: ACCOUNT_ROUTES.tickets,
  profile: ACCOUNT_ROUTES.profile,
  security: ACCOUNT_ROUTES.password,
};

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Movies used to open in a quick view on the catalog (`/movies?movie=<id>&show=…`).
  // Links shared back then land on the movie's own page, keeping the day, city and show.
  const legacyMovie = request.nextUrl.searchParams.get('movie');
  if (pathname === '/movies' && legacyMovie) {
    const target = new URL(`/movies/${encodeURIComponent(legacyMovie)}`, request.url);
    for (const key of ['city', 'date', 'show']) {
      const value = request.nextUrl.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    }
    return NextResponse.redirect(target, 308);
  }

  // The old tabbed panel (`/account?tab=…`) became pages; old links land on them.
  const legacyTab = request.nextUrl.searchParams.get('tab');
  if (pathname === ACCOUNT_ROUTES.overview && legacyTab) {
    const target = LEGACY_TABS[legacyTab] ?? ACCOUNT_ROUTES.overview;
    return NextResponse.redirect(new URL(target, request.url), 308);
  }

  // `/account/settings` has no page of its own: it opens the first section. Done here
  // rather than with redirect() in a page, so nothing renders on the way.
  if (pathname === ACCOUNT_ROUTES.settings) {
    return NextResponse.redirect(new URL(`${ACCOUNT_ROUTES.profile}${search}`, request.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/account/:path*',
    '/checkout/:path*',
    '/admin',
    '/admin/:path*',
    { source: '/movies', has: [{ type: 'query', key: 'movie' }] },
  ],
};
