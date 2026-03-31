import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MANAGER_ROUTES = ["/dashboard/people", "/dashboard/settings"];
const PUBLIC_AUTH_ROUTES = ["/login", "/accept-invite"];

function isManagerRoute(pathname: string): boolean {
  return MANAGER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function buildLoginRedirect(
  request: NextRequest,
  reason: "missing-session" | "inactive-user",
): NextResponse {
  const url = new URL("/login", request.url);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  let session: { user?: { role?: string; isActive?: boolean } } | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const forwardedHeaders = new Headers();
    const cookieHeader = request.headers.get("cookie");
    const hostHeader = request.headers.get("host");
    const forwardedHostHeader =
      request.headers.get("x-forwarded-host") ?? hostHeader;
    const forwardedProtoHeader =
      request.headers.get("x-forwarded-proto") ??
      request.nextUrl.protocol.replace(":", "");

    if (cookieHeader) {
      forwardedHeaders.set("cookie", cookieHeader);
    }
    if (hostHeader) {
      forwardedHeaders.set("host", hostHeader);
    }
    if (forwardedHostHeader) {
      forwardedHeaders.set("x-forwarded-host", forwardedHostHeader);
    }
    if (forwardedProtoHeader) {
      forwardedHeaders.set("x-forwarded-proto", forwardedProtoHeader);
    }
    forwardedHeaders.set("accept", "application/json");

    const response = await fetch(
      new URL("/api/auth/get-session", request.nextUrl.origin),
      {
        headers: forwardedHeaders,
        cache: "no-store",
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[proxy] Session lookup failed", {
        pathname,
        status: response.status,
        hasCookie: Boolean(cookieHeader),
        host: hostHeader,
        forwardedHost: forwardedHostHeader,
        forwardedProto: forwardedProtoHeader,
      });
      session = null;
    } else {
      session = await response.json();
    }
  } catch (error) {
    console.warn("[proxy] Session lookup threw", {
      pathname,
      message: error instanceof Error ? error.message : String(error),
    });
    session = null;
  }

  const isAuthPage = isPublicAuthRoute(pathname);
  const isDashboardPage = pathname.startsWith("/dashboard");

  if (!session) {
    if (isAuthPage) return NextResponse.next();
    if (isDashboardPage) {
      console.warn("[proxy] Redirecting to login: missing session", {
        pathname,
      });
      return buildLoginRedirect(request, "missing-session");
    }
    return NextResponse.next();
  }

  if (session.user?.isActive === false) {
    if (isDashboardPage) {
      console.warn("[proxy] Redirecting to login: inactive user", {
        pathname,
      });
      return buildLoginRedirect(request, "inactive-user");
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isDashboardPage && isManagerRoute(pathname)) {
    const role = session.user?.role as string | undefined;
    if (role !== "manager" && role !== "admin") {
      return NextResponse.redirect(
        new URL("/dashboard?error=forbidden", request.url),
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/accept-invite"],
};
