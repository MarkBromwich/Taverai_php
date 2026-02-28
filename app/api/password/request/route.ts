import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { serverError } from "@/lib/api";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username: email.toLowerCase() },
    });

    // Always return success (don’t reveal account existence)
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`Reset link (dev): http://localhost:3000/reset?token=${rawToken}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return serverError("Password reset request failed", err);
  }
}
