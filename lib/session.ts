import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "foodapp_session";

// Works in Route Handlers (NextRequest). Avoids next/headers cookies() async API.
export function getUserIdFromRequest(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE_NAME)?.value;
  return v && typeof v === "string" && v.trim() ? v : null;
}

export function requireUserId(req: NextRequest): string {
  const id = getUserIdFromRequest(req);
  if (!id) throw new Error("UNAUTHORIZED");
  return id;
}

export function setSessionCookie(res: NextResponse, userId: string) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: userId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // dev-friendly (set true only if you are on https)
    secure: false,
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 0,
  });
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}