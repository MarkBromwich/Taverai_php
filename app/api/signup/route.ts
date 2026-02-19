import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const COOKIE_NAME = "foodapp_session";

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const firstName = body?.firstName != null ? String(body.firstName).trim() : "";
    const lastName = body?.lastName != null ? String(body.lastName).trim() : "";

    // username is the email address
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

    const passwordHash = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        // keep these if they exist in your schema; otherwise Prisma will ignore? (it won't)
        // paidStatus and avatarUrl are safe only if they exist in schema
        // paidStatus: "Free",
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });

    // If you have UserPreferences in schema, create it now (safe try/catch)
    try {
      await prisma.userPreferences.create({
        data: { userId: user.id },
      });
    } catch {
      // ignore if already exists or if you don't have this table yet
    }

    const res = NextResponse.json({ user });

    res.cookies.set({
      name: COOKIE_NAME,
      value: user.id,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (err: any) {
    // Prisma unique constraint (just in case)
    const msg = String(err?.message ?? err);
    const code = String(err?.code ?? "");

    if (code === "P2002" || msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Signup failed", detail: msg },
      { status: 500 }
    );
  }
}