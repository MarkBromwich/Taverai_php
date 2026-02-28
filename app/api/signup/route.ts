import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { serverError, tooManyRequestsJson } from "@/lib/api";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { setSessionCookie } from "@/lib/session";

const SIGNUP_RULE = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("signup", [ip]), SIGNUP_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Too many signup attempts. Try again later.");
    }

    const body = await req.json().catch(() => ({}));

    const firstName = body?.firstName != null ? String(body.firstName).trim() : "";
    const lastName = body?.lastName != null ? String(body.lastName).trim() : "";
    const email = body?.username != null ? String(body.username).trim().toLowerCase() : "";
    const password = body?.password != null ? String(body.password) : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { username: email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        username: email,
        passwordHash: hashPassword(password),
        firstName: firstName || null,
        lastName: lastName || null,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });

    try {
      await prisma.userPreferences.create({
        data: { userId: user.id },
      });
    } catch {
      // preferences row is optional here
    }

    const res = NextResponse.json({ user });
    setSessionCookie(res, user.id);
    return res;
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const code = String(err?.code ?? "");

    if (code === "P2002" || msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }

    return serverError("Signup failed", err);
  }
}
