import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/') && isCrossOriginApiRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
