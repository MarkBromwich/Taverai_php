import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || password.length < 8) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const tokenHash = hashToken(token);

    const record = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
    }

    const newHash = hashPassword(password);

    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newHash },
    });

    await prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Reset failed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}