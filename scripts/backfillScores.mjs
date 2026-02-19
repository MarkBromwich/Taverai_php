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
    select: { id: true, userId: true, createdAt: true, parsed: true },
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
        const r = scoreMediterranean(e.parsed);
        result = { score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
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