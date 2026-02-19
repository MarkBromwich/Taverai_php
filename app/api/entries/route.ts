import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "foodapp_session";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/**
 * Convert YYYY-MM-DD to a safe Date INSIDE that day (midday UTC)
 * Avoids DST/timezone edge cases.
 */
function createdAtFromYMD(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

function dayRangeUTC(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------
   Scoring helpers
--------------------------------*/

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function macroPercentsFromGrams(proteinG: number, carbsG: number, fatG: number) {
  const pCals = proteinG * 4;
  const cCals = carbsG * 4;
  const fCals = fatG * 9;
  const total = pCals + cCals + fCals;
  if (!total || !Number.isFinite(total)) return null;

  return {
    protein: pCals / total, // 0..1
    carbs: cCals / total,
    fat: fCals / total,
    totalCals: total,
  };
}

function scoreWithinRange(pct: number, min: number, max: number) {
  // pct, min, max are 0..1
  if (pct >= min && pct <= max) return 100;

  // distance outside the range, normalized (soft penalty)
  const dist = pct < min ? (min - pct) : (pct - max);

  // 0.25 outside range => basically 0 score for that macro
  const s = 100 * (1 - clamp(dist / 0.25, 0, 1));
  return Math.round(s);
}

function scoreMediterraneanFromMacros(proteinG: number, carbsG: number, fatG: number) {
  const pct = macroPercentsFromGrams(proteinG, carbsG, fatG);
  if (!pct) return null;

  // Mediterranean “Balanced”: 45–65% carbs, 20–35% fats, 10–35% protein
  const sCarb = scoreWithinRange(pct.carbs, 0.45, 0.65);
  const sFat = scoreWithinRange(pct.fat, 0.20, 0.35);
  const sProt = scoreWithinRange(pct.protein, 0.10, 0.35);

  // weighted equally for now
  const score = Math.round((sCarb + sFat + sProt) / 3);

  const reasons: string[] = [];
  if (pct.carbs < 0.45) reasons.push("Carbs below target range");
  if (pct.carbs > 0.65) reasons.push("Carbs above target range");
  if (pct.fat < 0.20) reasons.push("Fat below target range");
  if (pct.fat > 0.35) reasons.push("Fat above target range");
  if (pct.protein < 0.10) reasons.push("Protein below target range");
  if (pct.protein > 0.35) reasons.push("Protein above target range");

  return {
    score,
    details: {
      reasons,
      breakdown: {
        macroPct: {
          carbs: Math.round(pct.carbs * 100),
          fat: Math.round(pct.fat * 100),
          protein: Math.round(pct.protein * 100),
        },
      },
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ymd = searchParams.get("date");
    const range = ymd ? dayRangeUTC(ymd) : null;

    const entries = await prisma.foodEntry.findMany({
      where: {
        userId,
        ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        scores: { include: { plan: true } },
      },
      take: 200,
    });

    return NextResponse.json({ entries });
  } catch (err: any) {
    console.error("Entries GET crashed:", err);
    return NextResponse.json(
      { error: "Entries GET crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const ymd = typeof body?.date === "string" ? body.date.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Optional nutrition fields (must match what the client sends)
    const calories = numOrNull(body?.calories);
    const proteinG = numOrNull(body?.proteinG);
    const carbsG = numOrNull(body?.carbsG);
    const fatG = numOrNull(body?.fatG);

    const createdAt = ymd ? createdAtFromYMD(ymd) : null;

    const hasNutrition =
      calories != null || proteinG != null || carbsG != null || fatG != null;

    const data: any = {
      userId,
      text,
      ...(createdAt ? { createdAt } : {}),

      ...(calories != null ? { calories } : {}),
      ...(proteinG != null ? { proteinG } : {}),
      ...(carbsG != null ? { carbsG } : {}),
      ...(fatG != null ? { fatG } : {}),
    };

    if (hasNutrition) {
      data.parsed = {
        calories: calories ?? 0,
        macros: {
          proteinG: proteinG ?? 0,
          carbsG: carbsG ?? 0,
          fatG: fatG ?? 0,
        },
      };
    }

    // 1) Create entry
    const entry = await prisma.foodEntry.create({
      data,
    });

    // 2) Find an “active” plan (simple: newest plan)
    const plan = await prisma.userPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // 3) Score + upsert EntryPlanScore (so the UI gauge has data)
    if (plan) {
      let computed:
        | { score: number; details?: { reasons?: string[]; breakdown?: Record<string, any> } }
        | null = null;

      if (plan.type === "MEDITERRANEAN") {
        // Need macros to score. If missing, we skip scoring.
        if (proteinG != null && carbsG != null && fatG != null) {
          computed = scoreMediterraneanFromMacros(proteinG, carbsG, fatG);
        }
      } else if (plan.type === "CALORIE") {
        // simple placeholder for calorie plan: if calories exist, score based on being <= daily goal
        // (you can refine later)
        if (calories != null) {
          const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { dailyCalorieGoal: true },
          });
          const goal = u?.dailyCalorieGoal ?? null;
          if (goal && goal > 0) {
            // if single entry calories exceeds goal, score low; else high.
            // (real version should score day totals, but this is enough to move gauge now)
            const pct = clamp(calories / goal, 0, 2);
            const score = Math.round(100 * clamp(1 - Math.max(0, pct - 1), 0, 1));
            computed = { score, details: { reasons: [] } };
          }
        }
      }

      if (computed && Number.isFinite(computed.score)) {
        await prisma.entryPlanScore.upsert({
          where: { entryId_planId: { entryId: entry.id, planId: plan.id } },
          update: {
            score: Math.round(computed.score),
            details: computed.details ?? undefined,
          },
          create: {
            entryId: entry.id,
            planId: plan.id,
            score: Math.round(computed.score),
            details: computed.details ?? undefined,
          },
        });
      }
    }

    // 4) Return entry WITH scores so the client updates immediately
    const full = await prisma.foodEntry.findUnique({
      where: { id: entry.id },
      include: { scores: { include: { plan: true } } },
    });

    return NextResponse.json({ entry: full ?? entry });
  } catch (err: any) {
    console.error("Entries POST crashed:", err);
    return NextResponse.json(
      { error: "Entries POST crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}