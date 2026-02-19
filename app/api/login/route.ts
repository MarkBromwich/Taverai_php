import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const COOKIE_NAME = "foodapp_session";

function verifyPassword(password: string, stored: string) {
  // stored format: scrypt$<salt>$<key>
  const [algo, salt, key] = String(stored || "").split("$");
  if (algo !== "scrypt" || !salt || !key) return false;

  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(derived, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim().toLowerCase(); // email stored in username
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
    return NextResponse.json(
      { error: "Login failed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}