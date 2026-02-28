import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { resolveDietScoringProfile } from "@/lib/dietScoringProfiles";
import { getUserIdFromRequest } from "@/lib/session";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { serverError, tooManyRequestsJson, unauthorizedJson } from "@/lib/api";

const ENTRY_AI_RULE = { limit: 30, windowMs: 10 * 60 * 1000 };

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

type FoodGroup = "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other";

function normalizeFoodGroup(v: any): FoodGroup {
  const x = String(v ?? "").toLowerCase().trim();
  if (["fruit", "fruits"].includes(x)) return "fruit";
  if (["vegetable", "vegetables", "veg", "veggies"].includes(x)) return "vegetable";
  if (["grain", "grains", "whole_grain", "whole grain"].includes(x)) return "grain";
  if (["protein", "meat", "fish", "egg", "eggs", "legume", "legumes", "beans"].includes(x)) return "protein";
  if (["dairy", "milk", "cheese", "yogurt", "yoghurt"].includes(x)) return "dairy";
  return "other";
}

function normalizeParsedItems(items: any): Array<{
  name: string;
  confidence: number | null;
  servings: number | null;
  foodGroup: FoodGroup;
  calories: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  fiberG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  tags: string[];
}> | null {
  if (!Array.isArray(items)) return null;

  const out = items
    .map((it: any) => {
      const name = typeof it?.name === "string" ? it.name.trim() : "";
      if (!name) return null;
      const tags = Array.isArray(it?.tags)
        ? it.tags
            .filter((t: any) => typeof t === "string")
            .map((t: string) => t.toLowerCase().trim())
            .filter(Boolean)
        : [];
      return {
        name,
        confidence: numOrNull(it?.confidence),
        servings: numOrNull(it?.servings),
        foodGroup: normalizeFoodGroup(it?.foodGroup),
        calories: numOrNull(it?.calories),
        sugarG: numOrNull(it?.sugarG),
        addedSugarG: numOrNull(it?.addedSugarG),
        fiberG: numOrNull(it?.fiberG),
        satFatG: numOrNull(it?.satFatG),
        sodiumMg: numOrNull(it?.sodiumMg),
        tags,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return out.length ? out : null;
}

async function parseNutritionFromText(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a nutrition estimation AI. Return ONLY valid JSON. Estimate realistic calories/macros and item-level nutrition for the full meal text. Be conservative and reasonable.",
      },
      {
        role: "user",
        content: `Analyze this food text and return JSON:
{
  "title": string,
  "calories": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "sugarG": number,
  "fiberG": number,
  "satFatG": number,
  "confidence": number,
  "notes": string,
  "items": [
    {
      "name": string,
      "confidence": number,
      "servings": number,
      "foodGroup": "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other",
      "calories": number,
      "sugarG": number,
      "addedSugarG": number,
      "fiberG": number,
      "satFatG": number,
      "sodiumMg": number,
      "tags": string[]
    }
  ]
}

Food text: "${text}"`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
    calories: numOrNull(parsed.calories),
    proteinG: numOrNull(parsed.proteinG),
    carbsG: numOrNull(parsed.carbsG),
    fatG: numOrNull(parsed.fatG),
    sugarG: numOrNull(parsed.sugarG),
    fiberG: numOrNull(parsed.fiberG),
    satFatG: numOrNull(parsed.satFatG),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    items: normalizeParsedItems(parsed.items),
    source: "textAI" as const,
  };
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

function scoreWithinRange(pct: number, min: number, max: number, penaltyDivisor: number) {
  // pct, min, max are 0..1
  if (pct >= min && pct <= max) return 100;

  // distance outside the range, normalized (soft penalty)
  const dist = pct < min ? (min - pct) : (pct - max);

  const divisor = Number.isFinite(penaltyDivisor) && penaltyDivisor > 0
    ? penaltyDivisor
    : 0.30;

  // Soft penalty curve tunable per diet profile.
  const s = 100 * (1 - clamp(dist / divisor, 0, 1));
  return Math.round(s);
}

function scoreMediterraneanFromMacros(
  proteinG: number,
  carbsG: number,
  fatG: number,
  planConfig: any,
  planName: string
) {
  const pct = macroPercentsFromGrams(proteinG, carbsG, fatG);
  if (!pct) return null;

  const profile = resolveDietScoringProfile(planConfig, planName);

  const sCarb = scoreWithinRange(
    pct.carbs,
    profile.carbs.min,
    profile.carbs.max,
    profile.penaltyDivisor
  );
  const sFat = scoreWithinRange(
    pct.fat,
    profile.fat.min,
    profile.fat.max,
    profile.penaltyDivisor
  );
  const sProt = scoreWithinRange(
    pct.protein,
    profile.protein.min,
    profile.protein.max,
    profile.penaltyDivisor
  );

  // weighted equally for now
  const score = Math.round((sCarb + sFat + sProt) / 3);

  const reasons: string[] = [];
  if (pct.carbs < profile.carbs.min) reasons.push("Carbs below target range");
  if (pct.carbs > profile.carbs.max) reasons.push("Carbs above target range");
  if (pct.fat < profile.fat.min) reasons.push("Fat below target range");
  if (pct.fat > profile.fat.max) reasons.push("Fat above target range");
  if (pct.protein < profile.protein.min) reasons.push("Protein below target range");
  if (pct.protein > profile.protein.max) reasons.push("Protein above target range");

  return {
    score,
    details: {
      reasons,
      breakdown: {
        profile: profile.slug,
        macroPct: {
          carbs: Math.round(pct.carbs * 100),
          fat: Math.round(pct.fat * 100),
          protein: Math.round(pct.protein * 100),
        },
        targetsPct: {
          carbs: {
            min: Math.round(profile.carbs.min * 100),
            max: Math.round(profile.carbs.max * 100),
          },
          fat: {
            min: Math.round(profile.fat.min * 100),
            max: Math.round(profile.fat.max * 100),
          },
          protein: {
            min: Math.round(profile.protein.min * 100),
            max: Math.round(profile.protein.max * 100),
          },
        },
      },
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

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
    return serverError("Failed to load entries", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("entries-ai", [userId, ip]), ENTRY_AI_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Entry analysis limit reached. Try again later.");
    }

    const body = await req.json().catch(() => ({}));

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const ymd = typeof body?.date === "string" ? body.date.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Optional nutrition fields (must match what the client sends)
    let calories = numOrNull(body?.calories);
    let proteinG = numOrNull(body?.proteinG);
    let carbsG = numOrNull(body?.carbsG);
    let fatG = numOrNull(body?.fatG);
    let sugarG = numOrNull(body?.sugarG);
    let fiberG = numOrNull(body?.fiberG);
    let satFatG = numOrNull(body?.satFatG);
    const incomingParsed = body?.parsed && typeof body.parsed === "object" ? body.parsed : null;
    let aiParsed: Awaited<ReturnType<typeof parseNutritionFromText>> = null;

    const createdAt = ymd ? createdAtFromYMD(ymd) : null;

    let hasNutrition =
      calories != null || proteinG != null || carbsG != null || fatG != null;

    // Text-only quick-add path: estimate nutrition with AI.
    if (!hasNutrition) {
      try {
        aiParsed = await parseNutritionFromText(text);
        if (aiParsed) {
          calories = aiParsed.calories;
          proteinG = aiParsed.proteinG;
          carbsG = aiParsed.carbsG;
          fatG = aiParsed.fatG;
          sugarG = aiParsed.sugarG;
          fiberG = aiParsed.fiberG;
          satFatG = aiParsed.satFatG;
          hasNutrition =
            calories != null || proteinG != null || carbsG != null || fatG != null;
        }
      } catch (e) {
        console.warn("Text nutrition parse failed:", e);
      }
    }

    const data: any = {
      userId,
      text,
      ...(createdAt ? { createdAt } : {}),

      ...(calories != null ? { calories } : {}),
      ...(proteinG != null ? { proteinG } : {}),
      ...(carbsG != null ? { carbsG } : {}),
      ...(fatG != null ? { fatG } : {}),
    };

    if (hasNutrition || incomingParsed || aiParsed) {
      const incomingItems = normalizeParsedItems((incomingParsed as any)?.items);
      data.parsed = {
        ...(incomingParsed ?? {}),
        ...(aiParsed
          ? {
              title: aiParsed.title,
              source: aiParsed.source,
              confidence: aiParsed.confidence,
              notes: aiParsed.notes,
              items: aiParsed.items ?? incomingItems,
            }
          : {}),
        ...(aiParsed ? {} : { items: incomingItems }),
        calories: calories ?? 0,
        macros: {
          proteinG: proteinG ?? 0,
          carbsG: carbsG ?? 0,
          fatG: fatG ?? 0,
        },
        nutrition: {
          sugarG: sugarG ?? numOrNull((incomingParsed as any)?.nutrition?.sugarG) ?? 0,
          fiberG: fiberG ?? numOrNull((incomingParsed as any)?.nutrition?.fiberG) ?? 0,
          satFatG: satFatG ?? numOrNull((incomingParsed as any)?.nutrition?.satFatG) ?? 0,
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
          computed = scoreMediterraneanFromMacros(
            proteinG,
            carbsG,
            fatG,
            plan.config,
            plan.name
          );
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
    return serverError("Failed to save entry", err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const existing = await prisma.foodEntry.findFirst({
      where: { id, userId },
      select: { id: true, parsed: true },
    });
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const calories = numOrNull(body?.calories);
    const proteinG = numOrNull(body?.proteinG);
    const carbsG = numOrNull(body?.carbsG);
    const fatG = numOrNull(body?.fatG);

    const existingParsed =
      existing?.parsed && typeof existing.parsed === "object"
        ? (existing.parsed as Record<string, any>)
        : {};
    const existingItems = normalizeParsedItems(existingParsed.items);

    const updated = await prisma.foodEntry.update({
      where: { id },
      data: {
        text,
        calories,
        proteinG,
        carbsG,
        fatG,
        parsed: {
          ...existingParsed,
          ...(existingItems ? { items: existingItems } : {}),
          calories: calories ?? 0,
          macros: {
            proteinG: proteinG ?? 0,
            carbsG: carbsG ?? 0,
            fatG: fatG ?? 0,
          },
        },
      },
    });

    const plan = await prisma.userPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (plan) {
      let computed:
        | { score: number; details?: { reasons?: string[]; breakdown?: Record<string, any> } }
        | null = null;

      if (plan.type === "MEDITERRANEAN") {
        if (proteinG != null && carbsG != null && fatG != null) {
          computed = scoreMediterraneanFromMacros(
            proteinG,
            carbsG,
            fatG,
            plan.config,
            plan.name
          );
        }
      } else if (plan.type === "CALORIE") {
        if (calories != null) {
          const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { dailyCalorieGoal: true },
          });
          const goal = u?.dailyCalorieGoal ?? null;
          if (goal && goal > 0) {
            const pct = clamp(calories / goal, 0, 2);
            const score = Math.round(100 * clamp(1 - Math.max(0, pct - 1), 0, 1));
            computed = { score, details: { reasons: [] } };
          }
        }
      }

      if (computed && Number.isFinite(computed.score)) {
        await prisma.entryPlanScore.upsert({
          where: { entryId_planId: { entryId: updated.id, planId: plan.id } },
          update: {
            score: Math.round(computed.score),
            details: computed.details ?? undefined,
          },
          create: {
            entryId: updated.id,
            planId: plan.id,
            score: Math.round(computed.score),
            details: computed.details ?? undefined,
          },
        });
      }
    }

    const full = await prisma.foodEntry.findUnique({
      where: { id: updated.id },
      include: { scores: { include: { plan: true } } },
    });

    return NextResponse.json({ entry: full ?? updated });
  } catch (err: any) {
    console.error("Entries PATCH crashed:", err);
    return serverError("Failed to update entry", err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await prisma.foodEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    await prisma.foodEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Entries DELETE crashed:", err);
    return serverError("Failed to delete entry", err);
  }
}
