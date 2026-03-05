import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Rotas que exigem role "manager" ou "admin" */
const MANAGER_ROUTES = [
  "/dashboard/people",
  "/dashboard/integrations",
  "/dashboard/settings",
];

/** Rotas públicas que não precisam de sessão */
const PUBLIC_AUTH_ROUTES = ["/login", "/accept-invite"];

/** Verifica se o pathname está sob uma das rotas restritas */
function isManagerRoute(pathname: string): boolean {
  return MANAGER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

/** Verifica se é uma rota pública de auth */
function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

export default async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const response = await fetch(
    new URL("/api/auth/get-session", request.nextUrl.origin),
    {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    },
  );

  const session = response.ok ? await response.json() : null;

  const isAuthPage = isPublicAuthRoute(pathname);
  const isDashboardPage = pathname.startsWith("/dashboard");

  if (!session) {
    if (isAuthPage) return NextResponse.next();
    if (isDashboardPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Usuário autenticado tentando acessar login → redireciona para dashboard
  // Mas NÃO redireciona /accept-invite (pode estar logado e aceitando convite de outra conta)
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
