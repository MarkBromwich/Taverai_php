import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { serverError } from "@/lib/api";

const TOKEN_BYTES = 32;            // strong
const EXPIRES_MINUTES = 30;        // reasonable default
const MAX_PER_IP_PER_10MIN = 5;    // basic rate limit

// super basic in-memory rate limit (dev/prototype friendly)
const bucket = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const rec = bucket.get(ip);

  if (!rec || rec.resetAt < now) {
    bucket.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (rec.count >= MAX_PER_IP_PER_10MIN) return false;
  rec.count += 1;
  bucket.set(ip, rec);
  return true;
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function baseUrlFromRequest(req: Request) {
  // Prefer Origin, fallback to Host
  const origin = req.headers.get("origin");
  if (origin) return origin;

  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";

    if (!rateLimit(ip)) {
      // Still don't reveal much
      return NextResponse.json(
        { ok: true, message: "If that email exists, a reset link has been sent." },
        { status: 200 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    // Always respond the same (no user enumeration)
    const generic = NextResponse.json(
      { ok: true, message: "If that email exists, a reset link has been sent." },
      { status: 200 }
    );

    if (!email || !email.includes("@")) return generic;

    const user = await prisma.user.findUnique({
      where: { username: email },
      select: { id: true },
    });

    if (!user) return generic;

    // Create token + store ONLY a hash
    const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
    const tokenHash = sha256(token);

    const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ip,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });

    const base = baseUrlFromRequest(req);
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== "production") {
      console.log("\nPassword reset link (dev):", link, "\n");
    }

    return generic;
  } catch (err: any) {
    return serverError("Forgot password failed", err);
  }
}
