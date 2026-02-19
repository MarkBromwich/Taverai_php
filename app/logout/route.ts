import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "foodapp_session";

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });

  // Clear cookie
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