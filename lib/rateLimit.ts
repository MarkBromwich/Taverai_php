import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export function getRequestIp(req: Request | NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

export async function checkRateLimit(key: string, rule: RateLimitRule) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + rule.windowMs);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({
      where: { key },
      select: { id: true, count: true, resetAt: true },
    });

    if (!existing || existing.resetAt <= now) {
      const bucket = await tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
        select: { count: true, resetAt: true },
      });
      return {
        ok: true,
        remaining: Math.max(0, rule.limit - bucket.count),
        retryAfterMs: Math.max(0, bucket.resetAt.getTime() - now.getTime()),
      };
    }

    if (existing.count >= rule.limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterMs: Math.max(0, existing.resetAt.getTime() - now.getTime()),
      };
    }

    const bucket = await tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { count: true, resetAt: true },
    });

    return {
      ok: true,
      remaining: Math.max(0, rule.limit - bucket.count),
      retryAfterMs: Math.max(0, bucket.resetAt.getTime() - now.getTime()),
    };
  });

  void prisma.rateLimitBucket
    .deleteMany({
      where: { resetAt: { lt: now } },
    })
    .catch(() => {
      // Best-effort cleanup only.
    });

  return result;
}

export function makeRateLimitKey(scope: string, parts: Array<string | null | undefined>) {
  return [scope, ...parts.map((part) => part?.trim() || "anon")].join(":");
}
