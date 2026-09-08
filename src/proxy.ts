import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-level routing guard. It only checks for the presence of the session
 * cookie (cheap, no DB). Real authentication happens in server components and
 * API routes via `requireUser()`, which validates the session against the DB.
 */
const SESSION_COOKIE = "aihub_session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tasks",
  "/courses",
  "/calendar",
  "/tutor",
  "/resources",
  "/grades",
  "/planner",
  "/settings",
  "/workspace",
  "/onboarding",
  "/admin",
];

const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (hasSession && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Baseline security headers (CSP is set in next.config.ts).
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)).*)"],
};
