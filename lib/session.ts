import crypto from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "foodapp_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  userId: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim()) return secret.trim();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "dev-only-session-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.userId !== "string" || !parsed.userId.trim()) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    return { userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string) {
  const payload = encodePayload({
    userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function parseSessionToken(token: string | null | undefined) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expectedSig = sign(payload);
  if (!safeEqual(sig, expectedSig)) return null;

  const decoded = decodePayload(payload);
  if (!decoded) return null;
  if (decoded.exp <= Date.now()) return null;
  return decoded.userId;
}

export function getCookieValue(req: Request | NextRequest, name: string) {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

export function getUserIdFromRequest(req: Request | NextRequest) {
  return parseSessionToken(getCookieValue(req, COOKIE_NAME));
}

export function requireUserId(req: Request | NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) throw new Error("UNAUTHORIZED");
  return userId;
}

export function setSessionCookie(res: NextResponse, userId: string) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: createSessionToken(userId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
