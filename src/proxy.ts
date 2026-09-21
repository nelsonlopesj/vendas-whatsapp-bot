import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // API routes: attach headers for tenant/user context
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    // Headers will be set from JWT token in the actual request
    // This is a lightweight pass-through; auth is enforced in route handlers
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

export const config = {
  // /api/upload fica FORA do proxy: com proxy o Next amortece o corpo da
  // requisição (default 10MB — proxyClientMaxBodySize) e uploads grandes
  // chegavam truncados ("Unexpected end of form" no busboy)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|api/upload).*)"],
};
