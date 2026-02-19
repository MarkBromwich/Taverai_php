import { prisma } from "@/lib/prisma";

/* =========================
   Types
   ========================= */

type ParsedItem = {
  name?: string;
  quantity?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  tags?: string[];
};

type ParsedEntry = {
  items?: ParsedItem[];
  dietTags?: string[];
  estimatedCalories?: number;
};

type PlanType = "MEDITERRANEAN" | "CALORIE";

type DbPlanRow = {
  id: string;
  name: string;
  type: string;
  config: any;
};

type Plan = {
  id: string;
  name: string;
  type: PlanType;
  calorieGoal?: number | null;
};

type ScoreResult = {
  planId: string;
  score: number;
  details: {
    reasons: string[];
    breakdown?: Record<string, number | null>;
  };
};

/* =========================
   Helpers
   ========================= */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTag(t: string): string {
  const x = String(t).toLowerCase().trim();
  if (x === "vegetables" || x === "veggies") return "vegetable";
  if (x === "grain") return "whole_grain";
  if (x === "wholegrain") return "whole_grain";
  if (x === "legumes") return "legume";
  if (x === "olive" || x === "olive oil") return "olive_oil";
  if (x === "red meat") return "red_meat";
  return x;
}

function extractTags(parsed: ParsedEntry): string[] {
  const tags: string[] = [];
  for (const it of parsed.items ?? []) {
    for (const t of it.tags ?? []) {
      if (typeof t === "string") tags.push(normalizeTag(t));
    }
  }
  return tags;
}

function count(tags: string[], key: string) {
  return tags.filter((t) => t === key).length;
}

/* =========================
   Mediterranean scorer
   ========================= */

function scoreMediterranean(parsed: ParsedEntry): {
  score: number;
  reasons: string[];
  breakdown: Record<string, number | null>;
} {
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

  const breakdown: Record<string, number | null> = {
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

  const raw =
    60 + Object.values(breakdown).reduce<number>((a, b) => a + (b ?? 0), 0);

  const score = clamp(Math.round(raw), 0, 100);

  const positives = Object.entries(breakdown)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  const negatives = Object.entries(breakdown)
    .filter(([, v]) => (v ?? 0) < 0)
    .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0)); // most negative first

  const reasons: string[] = [];
  for (const [k, v] of positives.slice(0, 2)) {
    reasons.push(`+${v} ${k.replaceAll("_", " ")}`);
  }
  if (negatives.length > 0) {
    const [k, v] = negatives[0];
    reasons.push(`${v} ${k.replaceAll("_", " ")}`);
  }
  if (reasons.length === 0) reasons.push("Not enough tagged foods yet");

  return { score, reasons, breakdown };
}

/* =========================
   Calorie scorer (per entry)
   ========================= */

function scoreCalorie(
  parsed: ParsedEntry,
  calorieGoal?: number | null
): { score: number; reasons: string[]; breakdown: Record<string, number | null> } {
  const calories =
    typeof parsed.estimatedCalories === "number"
      ? parsed.estimatedCalories
      : 0;

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

  const reasons: string[] = [];
  if (diff === 0) reasons.push("Right on your calorie goal");
  else if (diff < 0) reasons.push(`Under goal by ${Math.abs(diff)} calories`);
  else reasons.push(`Over goal by ${diff} calories`);

  if (pct <= 0.1) reasons.push("Within 10% of your target");
  else if (pct <= 0.25) reasons.push("A bit off target — tighten portions");
  else reasons.push("Far off target — consider smaller meals");

  return {
    score,
    reasons: reasons.slice(0, 3),
    breakdown: {
      calories: Math.round(calories),
      goal: Math.round(calorieGoal),
      diff,
    },
  };
}

/* =========================
   Main: score + upsert to DB
   ========================= */

export async function scoreEntryForUserPlans(opts: {
  userId: string;
  entryId: string;
  entryCreatedAt: Date;
  parsed: ParsedEntry;
}) {
  const { userId, entryId, parsed } = opts;

  const plansFromDb: DbPlanRow[] = await prisma.userPlan.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, config: true },
    orderBy: { createdAt: "asc" },
  });

  if (plansFromDb.length === 0) return 0;

  const plans: Plan[] = plansFromDb.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type as PlanType,
    calorieGoal:
      p.type === "CALORIE" ? Number(p.config?.targetCalories ?? 0) : null,
  }));

  const results: ScoreResult[] = plans.map((p) => {
    if (p.type === "MEDITERRANEAN") {
      const r = scoreMediterranean(parsed);
      return { planId: p.id, score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
    }
    const r = scoreCalorie(parsed, p.calorieGoal ?? null);
    return { planId: p.id, score: r.score, details: { reasons: r.reasons, breakdown: r.breakdown } };
  });

  let wrote = 0;
  for (const r of results) {
    await prisma.entryPlanScore.upsert({
      where: { entryId_planId: { entryId, planId: r.planId } },
      update: { score: r.score, details: r.details },
      create: { entryId, planId: r.planId, score: r.score, details: r.details },
    });
    wrote++;
  }

  return wrote;
}