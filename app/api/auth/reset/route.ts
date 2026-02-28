import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { hashPassword } from "@/lib/passwords";
import { serverError } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const newPassword = String(body?.newPassword ?? "");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const tokenHash = sha256(token);
    const now = new Date();

    // Find usable token
    const rec = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!rec || rec.usedAt || rec.expiresAt <= now) {
      return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 });
    }

    const nextHash = hashPassword(newPassword);

    // One transaction: update password + mark token used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash: nextHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: rec.id },
        data: { usedAt: now },
      }),
    ]);

    // Optional: you can also clear the cookie here to force re-login
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);

    return res;
  } catch (err: any) {
    return serverError("Password reset failed", err);
  }
}
