import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveDietScoringProfile } from "@/lib/dietScoringProfiles";
import { getUserIdFromRequest } from "@/lib/session";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { serverError, tooManyRequestsJson, unauthorizedJson } from "@/lib/api";

const ANALYZE_RULE = { limit: 20, windowMs: 10 * 60 * 1000 };

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function macroPercentsFromGrams(proteinG: number, carbsG: number, fatG: number) {
  const pCals = proteinG * 4;
  const cCals = carbsG * 4;
  const fCals = fatG * 9;
  const total = pCals + cCals + fCals;
  if (!total || !Number.isFinite(total)) return null;
  return { protein: pCals / total, carbs: cCals / total, fat: fCals / total };
}

function scoreWithinRange(pct: number, min: number, max: number, penaltyDivisor: number) {
  if (pct >= min && pct <= max) return 100;
  const dist = pct < min ? min - pct : pct - max;
  const divisor = Number.isFinite(penaltyDivisor) && penaltyDivisor > 0 ? penaltyDivisor : 0.3;
  return Math.round(100 * (1 - clamp(dist / divisor, 0, 1)));
}

function scoreOptionFromNutrition(
  profile: ReturnType<typeof resolveDietScoringProfile>,
  calories: number | null,
  proteinG: number | null,
  carbsG: number | null,
  fatG: number | null,
  sugarG: number | null,
  satFatG: number | null
) {
  if (proteinG == null || carbsG == null || fatG == null) {
    return { score: 55, reasons: ["Not enough macro detail to score accurately."] };
  }

  const pct = macroPercentsFromGrams(proteinG, carbsG, fatG);
  if (!pct) return { score: 55, reasons: ["Macros were incomplete."] };

  const sCarb = scoreWithinRange(pct.carbs, profile.carbs.min, profile.carbs.max, profile.penaltyDivisor);
  const sFat = scoreWithinRange(pct.fat, profile.fat.min, profile.fat.max, profile.penaltyDivisor);
  const sProt = scoreWithinRange(pct.protein, profile.protein.min, profile.protein.max, profile.penaltyDivisor);
  let score = Math.round((sCarb + sFat + sProt) / 3);

  const energy = calories ?? proteinG * 4 + carbsG * 4 + fatG * 9;
  if (energy > 0) {
    if (sugarG != null) {
      const sugarPct = (sugarG * 4) / energy;
      if (sugarPct > 0.12) score -= 8;
      else if (sugarPct > 0.1) score -= 4;
    }
    if (satFatG != null) {
      const satPct = (satFatG * 9) / energy;
      if (satPct > 0.12) score -= 8;
      else if (satPct > 0.1) score -= 4;
    }
  }

  score = clamp(score, 0, 100);
  const reasons: string[] = [];
  if (pct.carbs < profile.carbs.min) reasons.push("Carbs lower than plan target");
  if (pct.carbs > profile.carbs.max) reasons.push("Carbs higher than plan target");
  if (pct.fat < profile.fat.min) reasons.push("Fat lower than plan target");
  if (pct.fat > profile.fat.max) reasons.push("Fat higher than plan target");
  if (pct.protein < profile.protein.min) reasons.push("Protein lower than plan target");
  if (pct.protein > profile.protein.max) reasons.push("Protein higher than plan target");
  if (!reasons.length) reasons.push("Macros align well with plan targets");

  return { score, reasons };
}

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("menu-analyze", [userId, ip]), ANALYZE_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Menu comparison limit reached. Try again later.");
    }

    const body = await req.json().catch(() => ({}));
    const options = Array.isArray(body?.options)
      ? body.options.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 8)
      : [];
    const context = typeof body?.context === "string" ? body.context.trim() : "";
    const providedNutrition = Array.isArray(body?.providedNutrition) ? body.providedNutrition.slice(0, 8) : [];

    if (!options.length) {
      return NextResponse.json({ error: "Provide at least one menu option." }, { status: 400 });
    }

    const plan = await prisma.userPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, type: true, config: true },
    });

    const profile = resolveDietScoringProfile(plan?.config, plan?.name ?? null);
    let aiRows: any[] = [];

    if (providedNutrition.length) {
      aiRows = providedNutrition.map((row: any, i: number) => ({
        optionIndex: i,
        name: typeof row?.name === "string" ? row.name : options[i],
        calories: row?.calories,
        proteinG: row?.proteinG,
        carbsG: row?.carbsG,
        fatG: row?.fatG,
        sugarG: row?.sugarG,
        satFatG: row?.satFatG,
        fiberG: row?.fiberG,
        summary: typeof row?.summary === "string" ? row.summary : "",
      }));
    } else {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";
      const prompt = [
        "Estimate nutrition for each menu option. Return ONLY valid JSON.",
        "Be conservative and realistic. Use complete meal totals.",
        "",
        "JSON shape:",
        "{",
        '  "results": [',
        "    {",
        '      "optionIndex": number,',
        '      "name": string,',
        '      "calories": number,',
        '      "proteinG": number,',
        '      "carbsG": number,',
        '      "fatG": number,',
        '      "sugarG": number,',
        '      "satFatG": number,',
        '      "fiberG": number,',
        '      "summary": string',
        "    }",
        "  ]",
        "}",
        "",
        context ? `Context: ${context}` : "",
        "Options:",
        ...options.map((opt: string, i: number) => `${i}: ${opt}`),
      ].join("\n");

      const ai = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a nutrition estimation assistant for restaurant menus. Return strict JSON only." },
          { role: "user", content: prompt },
        ],
      });

      const raw = ai.choices[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
      aiRows = Array.isArray(parsed?.results) ? parsed.results : [];
    }

    const results = options.map((opt: string, i: number) => {
      const row = aiRows.find((r: any) => Number(r?.optionIndex) === i) ?? {};
      const calories = numOrNull(row?.calories);
      const proteinG = numOrNull(row?.proteinG);
      const carbsG = numOrNull(row?.carbsG);
      const fatG = numOrNull(row?.fatG);
      const sugarG = numOrNull(row?.sugarG);
      const satFatG = numOrNull(row?.satFatG);
      const fiberG = numOrNull(row?.fiberG);
      const summary = typeof row?.summary === "string" ? row.summary : "";
      const scored = scoreOptionFromNutrition(profile, calories, proteinG, carbsG, fatG, sugarG, satFatG);

      return {
        optionIndex: i,
        name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : opt,
        calories,
        proteinG,
        carbsG,
        fatG,
        sugarG,
        satFatG,
        fiberG,
        fitScore: scored.score,
        reasons: scored.reasons,
        summary,
      };
    });

    const ranked = [...results].sort((a, b) => b.fitScore - a.fitScore);

    return NextResponse.json({
      plan: {
        id: plan?.id ?? null,
        name: plan?.name ?? "No active plan",
        type: plan?.type ?? null,
        profile,
      },
      options: results,
      ranked,
      bestOptionIndex: ranked[0]?.optionIndex ?? null,
    });
  } catch (err) {
    return serverError("Menu analysis failed", err);
  }
}
