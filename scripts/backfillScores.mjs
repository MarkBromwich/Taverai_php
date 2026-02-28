import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Backfills/upserts entryPlanScore for ALL entries in the DB
 * using the SAME scoring function your app uses at runtime.
 *
 * ✅ No hard-coded “tag detected” fallbacks here.
 * ✅ Uses deterministic scoring from lib/scoring/scorePlans.ts
 */

async function main() {
  // Import the DB-writing scorer (compiled by Node as ESM via next/ts tooling is not guaranteed),
  // so we implement the same scoring logic directly here with Prisma.
  //
  // IMPORTANT: Keep this in sync with lib/scoring/scorePlans.ts

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function normalizeTag(t) {
    const x = String(t).toLowerCase().trim();
    if (x === "vegetables" || x === "veggies") return "vegetable";
    if (x === "grain") return "whole_grain";
    if (x === "wholegrain") return "whole_grain";
    if (x === "legumes") return "legume";
    if (x === "olive" || x === "olive oil") return "olive_oil";
    if (x === "red meat") return "red_meat";
    return x;
  }

  function extractTags(parsed) {
    const tags = [];
    for (const it of parsed?.items ?? []) {
      for (const t of it?.tags ?? []) {
        if (typeof t === "string") tags.push(normalizeTag(t));
      }
    }
    return tags;
  }

  function count(tags, key) {
    let c = 0;
    for (const t of tags) if (t === key) c++;
    return c;
  }

  function scoreMediterranean(parsed) {
    const tags = extractTags(parsed);

    const veg = count(tags, "vegetable");
    const fruit = count(tags, "fruit");
    const whole = count(tags, "whole_grain");
    const fish = count(tags, "fish");
    const legume = count(tags, "legume");
    const nuts = count(tags, "nuts");
    const olive = count(tags, "olive_oil");

    const processed = count(tags, "processed");
    const redMeat = count(tags, "red_meat");
    const sugary = count(tags, "sugary");
    const fried = count(tags, "fried");
    const soda = count(tags, "soda");

    const breakdown = {
      vegetables: veg * 10,
      fruit: fruit * 6,
      whole_grain: whole * 8,
      fish: fish * 10,
      legumes: legume * 8,
      nuts: nuts * 6,
      olive_oil: olive * 6,
      processed: processed * -12,
      red_meat: redMeat * -12,
      sugary: sugary * -10,
      fried: fried * -10,
      soda: soda * -12,
    };

    const raw = 60 + Object.values(breakdown).reduce((a, b) => a + (b ?? 0), 0);
    const score = clamp(Math.round(raw), 0, 100);

    const positives = Object.entries(breakdown)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

    const negatives = Object.entries(breakdown)
      .filter(([, v]) => (v ?? 0) < 0)
      .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));

    const reasons = [];
    for (const [k, v] of positives.slice(0, 2)) {
      reasons.push(`+${v} ${String(k).replaceAll("_", " ")}`);
    }
    if (negatives.length > 0) {
      const [k, v] = negatives[0];
      reasons.push(`${v} ${String(k).replaceAll("_", " ")}`);
    }
    if (reasons.length === 0) reasons.push("Not enough tagged foods yet");

    return { score, reasons, breakdown };
  }

  const DEFAULT_PROFILE = {
    slug: "mediterranean",
    carbs: { min: 0.42, max: 0.65 },
    fat: { min: 0.20, max: 0.40 },
    protein: { min: 0.10, max: 0.35 },
    penaltyDivisor: 0.30,
  };

  const PROFILES_BY_SLUG = {
    mediterranean: DEFAULT_PROFILE,
    dash: { slug: "dash", carbs: { min: 0.45, max: 0.60 }, fat: { min: 0.20, max: 0.32 }, protein: { min: 0.15, max: 0.30 }, penaltyDivisor: 0.28 },
    mind: { slug: "mind", carbs: { min: 0.42, max: 0.58 }, fat: { min: 0.25, max: 0.40 }, protein: { min: 0.15, max: 0.30 }, penaltyDivisor: 0.29 },
    pescatarian: { slug: "pescatarian", carbs: { min: 0.40, max: 0.55 }, fat: { min: 0.25, max: 0.40 }, protein: { min: 0.18, max: 0.35 }, penaltyDivisor: 0.27 },
    "plant-forward": { slug: "plant-forward", carbs: { min: 0.45, max: 0.65 }, fat: { min: 0.20, max: 0.35 }, protein: { min: 0.12, max: 0.28 }, penaltyDivisor: 0.30 },
    vegetarian: { slug: "vegetarian", carbs: { min: 0.45, max: 0.65 }, fat: { min: 0.20, max: 0.35 }, protein: { min: 0.12, max: 0.28 }, penaltyDivisor: 0.30 },
    vegan: { slug: "vegan", carbs: { min: 0.50, max: 0.68 }, fat: { min: 0.18, max: 0.32 }, protein: { min: 0.12, max: 0.25 }, penaltyDivisor: 0.31 },
    flexitarian: { slug: "flexitarian", carbs: { min: 0.42, max: 0.62 }, fat: { min: 0.22, max: 0.37 }, protein: { min: 0.15, max: 0.30 }, penaltyDivisor: 0.30 },
    "anti-inflammatory": { slug: "anti-inflammatory", carbs: { min: 0.40, max: 0.55 }, fat: { min: 0.25, max: 0.40 }, protein: { min: 0.18, max: 0.32 }, penaltyDivisor: 0.28 },
    "low-gi": { slug: "low-gi", carbs: { min: 0.35, max: 0.50 }, fat: { min: 0.25, max: 0.40 }, protein: { min: 0.18, max: 0.35 }, penaltyDivisor: 0.27 },
    "high-fiber": { slug: "high-fiber", carbs: { min: 0.45, max: 0.65 }, fat: { min: 0.20, max: 0.35 }, protein: { min: 0.12, max: 0.30 }, penaltyDivisor: 0.30 },
    volumetrics: { slug: "volumetrics", carbs: { min: 0.45, max: 0.62 }, fat: { min: 0.18, max: 0.30 }, protein: { min: 0.15, max: 0.30 }, penaltyDivisor: 0.27 },
    "high-protein": { slug: "high-protein", carbs: { min: 0.20, max: 0.40 }, fat: { min: 0.20, max: 0.35 }, protein: { min: 0.28, max: 0.45 }, penaltyDivisor: 0.25 },
    keto: { slug: "keto", carbs: { min: 0.02, max: 0.10 }, fat: { min: 0.60, max: 0.75 }, protein: { min: 0.18, max: 0.32 }, penaltyDivisor: 0.22 },
    paleo: { slug: "paleo", carbs: { min: 0.20, max: 0.35 }, fat: { min: 0.30, max: 0.45 }, protein: { min: 0.25, max: 0.40 }, penaltyDivisor: 0.25 },
    whole30: { slug: "whole30", carbs: { min: 0.25, max: 0.40 }, fat: { min: 0.30, max: 0.45 }, protein: { min: 0.22, max: 0.38 }, penaltyDivisor: 0.25 },
    "intermittent-fasting": { slug: "intermittent-fasting", carbs: { min: 0.35, max: 0.55 }, fat: { min: 0.22, max: 0.38 }, protein: { min: 0.18, max: 0.32 }, penaltyDivisor: 0.30 },
    "gluten-free": { slug: "gluten-free", carbs: { min: 0.40, max: 0.60 }, fat: { min: 0.22, max: 0.36 }, protein: { min: 0.15, max: 0.32 }, penaltyDivisor: 0.30 },
    "low-fodmap": { slug: "low-fodmap", carbs: { min: 0.35, max: 0.50 }, fat: { min: 0.25, max: 0.38 }, protein: { min: 0.18, max: 0.35 }, penaltyDivisor: 0.28 },
  };

  function slugify(input) {
    return String(input ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function resolveProfile(config, planName) {
    const saved = config?.scoringProfile;
    if (
      saved &&
      saved.carbs?.min != null &&
      saved.carbs?.max != null &&
      saved.fat?.min != null &&
      saved.fat?.max != null &&
      saved.protein?.min != null &&
      saved.protein?.max != null &&
      saved.penaltyDivisor != null
    ) {
      return {
        slug: String(saved.slug ?? "custom"),
        carbs: { min: Number(saved.carbs.min), max: Number(saved.carbs.max) },
        fat: { min: Number(saved.fat.min), max: Number(saved.fat.max) },
        protein: { min: Number(saved.protein.min), max: Number(saved.protein.max) },
        penaltyDivisor: Number(saved.penaltyDivisor),
      };
    }

    const fromTemplate = PROFILES_BY_SLUG[slugify(config?.templateSlug)];
    if (fromTemplate) return fromTemplate;
    const fromName = PROFILES_BY_SLUG[slugify(planName)];
    if (fromName) return fromName;
    return DEFAULT_PROFILE;
  }

  function scoreWithinRange(pct, min, max, penaltyDivisor) {
    if (pct >= min && pct <= max) return 100;
    const dist = pct < min ? min - pct : pct - max;
    const divisor = Number.isFinite(penaltyDivisor) && penaltyDivisor > 0
      ? penaltyDivisor
      : 0.30;
    return Math.round(100 * (1 - clamp(dist / divisor, 0, 1)));
  }

  function scoreMediterraneanFromMacros(proteinG, carbsG, fatG, profile) {
    const pCals = Number(proteinG ?? 0) * 4;
    const cCals = Number(carbsG ?? 0) * 4;
    const fCals = Number(fatG ?? 0) * 9;
    const total = pCals + cCals + fCals;
    if (!Number.isFinite(total) || total <= 0) return null;

    const pct = {
      protein: pCals / total,
      carbs: cCals / total,
      fat: fCals / total,
    };

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

    const score = Math.round((sCarb + sFat + sProt) / 3);

    const reasons = [];
    if (pct.carbs < profile.carbs.min) reasons.push("Carbs below target range");
    if (pct.carbs > profile.carbs.max) reasons.push("Carbs above target range");
    if (pct.fat < profile.fat.min) reasons.push("Fat below target range");
    if (pct.fat > profile.fat.max) reasons.push("Fat above target range");
    if (pct.protein < profile.protein.min) reasons.push("Protein below target range");
    if (pct.protein > profile.protein.max) reasons.push("Protein above target range");

    return {
      score,
      reasons,
      breakdown: {
        profile: profile.slug,
        macroPct: {
          carbs: Math.round(pct.carbs * 100),
          fat: Math.round(pct.fat * 100),
          protein: Math.round(pct.protein * 100),
        },
      },
    };
  }

  function scoreCalorie(parsed, calorieGoal) {
    const calories =
      typeof parsed?.estimatedCalories === "number" ? parsed.estimatedCalories : 0;

    if (!calorieGoal || calorieGoal <= 0) {
      return {
        score: 70,
        reasons: [`Total estimated calories: ${Math.round(calories)}`],
        breakdown: { calories: Math.round(calories), goal: null, diff: null },
      };
    }

    const diff = Math.round(calories - calorieGoal);
    const pct = Math.abs(diff) / calorieGoal;

    let score = 100 - Math.round(pct * 200);
    score = clamp(score, 0, 100);

    const reasons = [];
    if (diff === 0) reasons.push("Right on your calorie goal");
    else if (diff < 0) reasons.push(`Under goal by ${Math.abs(diff)} calories`);
    else reasons.push(`Over goal by ${diff} calories`);

    if (pct <= 0.1) reasons.push("Within 10% of your target");
    else if (pct <= 0.25) reasons.push("A bit off target — tighten portions");
    else reasons.push("Far off target — consider smaller meals");

    return {
      score,
      reasons: reasons.slice(0, 3),
      breakdown: { calories: Math.round(calories), goal: Math.round(calorieGoal), diff },
    };
  }

  // Load all entries (oldest to newest)
  const entries = await prisma.foodEntry.findMany({
    select: {
      id: true,
      userId: true,
      createdAt: true,
      parsed: true,
      calories: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let upserted = 0;

  for (const e of entries) {
    const plans = await prisma.userPlan.findMany({
      where: { userId: e.userId },
      select: { id: true, type: true, name: true, config: true },
      orderBy: { createdAt: "asc" },
    });

    for (const p of plans) {
      let result;

      if (p.type === "MEDITERRANEAN") {
        const profile = resolveProfile(p.config, p.name);
        const proteinG =
          e?.proteinG ?? e?.parsed?.macros?.proteinG ?? e?.parsed?.proteinG ?? null;
        const carbsG =
          e?.carbsG ?? e?.parsed?.macros?.carbsG ?? e?.parsed?.carbsG ?? null;
        const fatG =
          e?.fatG ?? e?.parsed?.macros?.fatG ?? e?.parsed?.fatG ?? null;

        if (
          proteinG != null &&
          carbsG != null &&
          fatG != null &&
          Number.isFinite(Number(proteinG)) &&
          Number.isFinite(Number(carbsG)) &&
          Number.isFinite(Number(fatG))
        ) {
          const r = scoreMediterraneanFromMacros(proteinG, carbsG, fatG, profile);
          if (!r) continue;
          result = { score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
        } else {
          const r = scoreMediterranean(e.parsed);
          result = { score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
        }
      } else if (p.type === "CALORIE") {
        const goal = Number(p.config?.targetCalories ?? 0);
        const r = scoreCalorie(e.parsed, goal);
        result = { score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
      } else {
        continue;
      }

      await prisma.entryPlanScore.upsert({
        where: { entryId_planId: { entryId: e.id, planId: p.id } },
        update: { score: result.score, details: result.details },
        create: { entryId: e.id, planId: p.id, score: result.score, details: result.details },
      });

      upserted++;
    }
  }

  console.log(`Backfill complete. Upserted/updated ${upserted} score rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
