import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "foodapp_session";

function isPublicFile(pathname: string) {
  return (
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".txt") ||
    pathname.endsWith(".xml") ||
    pathname.endsWith(".json") ||
    pathname.endsWith(".map") ||

    // PWA / platform files (safe to allow even if you don't have them yet)
    pathname.endsWith(".webmanifest") ||
    pathname === "/sw.js"
  );
}

function safeNextParam(req: NextRequest) {
  const nextPath = req.nextUrl.pathname + req.nextUrl.search;
  return nextPath.startsWith("/") ? nextPath : "/log";
}

function safeRedirectTarget(next: string | null) {
  if (!next) return "/log";
  if (!next.startsWith("/")) return "/log";
  // prevent weird loops back to auth pages
  if (next.startsWith("/login") || next.startsWith("/signup")) return "/log";
  return next;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Always allow Next internals + public/static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    isPublicFile(pathname)
  ) {
    return NextResponse.next();
  }

  // 2) Always allow API routes (don’t break fetches / auth endpoints)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const session = req.cookies.get(COOKIE_NAME)?.value;

  // 3) Auth pages
  const isAuthPage = 
    pathname === "/login" || 
    pathname === "/signup" ||
    pathname === "/forgot" ||
    pathname === "/reset";

  // If logged IN, keep them out of /login and /signup
  if (session && isAuthPage) {
    const url = req.nextUrl.clone();
    const next = safeRedirectTarget(req.nextUrl.searchParams.get("next"));
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If logged OUT, allow /login and /signup (everything else redirects to login)
  if (!session && !isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeNextParam(req));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Apply broadly; we still allow-list /_next + public files in code above
  matcher: ["/((?!_next/static|_next/image).*)"],
};