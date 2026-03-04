import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "foodapp_session";
const DEV_SESSION_SECRET = "dev-only-session-secret-change-me";

type SessionPayload = {
  userId: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return DEV_SESSION_SECRET;
}

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 0) return normalized;
  return normalized + "=".repeat(4 - remainder);
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const json = atob(base64UrlToBase64(encoded));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.userId !== "string" || !parsed.userId.trim()) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    return { userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const decoded = decodePayload(payload);
  if (!decoded || decoded.exp <= Date.now()) return false;

  const expectedSig = await sign(payload);
  return constantTimeEqual(
    new TextEncoder().encode(sig),
    new TextEncoder().encode(expectedSig)
  );
}

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

export async function middleware(req: NextRequest) {
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

  const hasSession = await hasValidSession(req);

  // 3) Auth pages
  const isAuthPage = 
    pathname === "/login" || 
    pathname === "/signup" ||
    pathname === "/forgot" ||
    pathname === "/reset";

  // If logged IN, keep them out of /login and /signup
  if (hasSession && isAuthPage) {
    const url = req.nextUrl.clone();
    const next = safeRedirectTarget(req.nextUrl.searchParams.get("next"));
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If logged OUT, allow /login and /signup (everything else redirects to login)
  if (!hasSession && !isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeNextParam(req));
    const res = NextResponse.redirect(url);
    res.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Apply broadly; we still allow-list /_next + public files in code above
  matcher: ["/((?!_next/static|_next/image).*)"],
};
