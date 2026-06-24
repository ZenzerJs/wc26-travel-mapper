import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

function applySecurityHeaders(response: NextResponse): NextResponse {
  // Allow portfolio site to embed this app in an iframe demo
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://jaydens-dev-portfolio.vercel.app https://*.vercel.app http://localhost:* http://127.0.0.1:*",
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  return response;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Reject browser cross-origin calls to our API proxy routes. */
function isCrossOriginApiRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const host = request.headers.get('host');
  if (!host) return false;

  try {
    const originHost = new URL(origin).host;
    return originHost !== host;
  } catch {
    return true;
  }
}

/**
 * Limit calls to paid upstream APIs (Mapbox, Amadeus, etc.).
 * Browser traffic gets a higher ceiling; scripts without Origin are tighter.
 */
function rateLimitApiRequest(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;

  const ip = getClientIp(request);
  const isPaidProxy = request.nextUrl.pathname.startsWith('/api/routes/');
  const hasBrowserOrigin = Boolean(request.headers.get('origin'));
  const windowMs = 60_000;

  const limit = isPaidProxy ? (hasBrowserOrigin ? 100 : 20) : 60;
  const bucketKey = `${ip}:${isPaidProxy ? 'routes' : 'api'}`;
  const result = checkRateLimit(bucketKey, limit, windowMs);

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSec) },
      }
    );
  }

  return null;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/') && isCrossOriginApiRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rateLimited = rateLimitApiRequest(request);
  if (rateLimited) return applySecurityHeaders(rateLimited);

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
