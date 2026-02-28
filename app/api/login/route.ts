import { prisma } from "@/lib/prisma";
import { serverError, tooManyRequestsJson } from "@/lib/api";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { verifyPassword } from "@/lib/passwords";
import { setSessionCookie } from "@/lib/session";
import { NextResponse } from "next/server";

const LOGIN_RULE = { limit: 8, windowMs: 10 * 60 * 1000 };

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("login", [ip]), LOGIN_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Too many login attempts. Try again later.");
    }

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!username || !username.includes("@")) {
      return NextResponse.json({ error: "Please enter your email address." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Please enter your password." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true, firstName: true, lastName: true },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const res = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
      },
    });

    setSessionCookie(res, user.id);
    return res;
  } catch (err) {
    return serverError("Login failed", err);
  }
}
