"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./coach.module.css";

type Plan = { id: string; name: string; type: string };
type ScoreRow = {
  score: number;
  details?: { reasons?: string[]; breakdown?: Record<string, any> };
  plan: Plan;
};

type Entry = {
  id: string;
  text: string;
  createdAt: string;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  parsed?: {
    title?: string;
    estimatedCalories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    calories?: number;
    kcal?: number;
    macros?: { proteinG?: number; carbsG?: number; fatG?: number };
    nutrition?: { calories?: number; sugarG?: number; fiberG?: number; satFatG?: number };
    items?: Array<{
      name?: string;
      tags?: string[];
      calories?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      servings?: number;
      foodGroup?: "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other";
      sodiumMg?: number;
      sugarG?: number;
      addedSugarG?: number;
      fiberG?: number;
      satFatG?: number;
    }>;
    dietTags?: string[];
  };
  scores?: ScoreRow[];
};

type Me = { username: string; dailyCalorieGoal: number | null };
type TrendWindow = "weekly" | "monthly" | "yearly";
type DailySummary = {
  entries: number;
  score: number | null;
  calories: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  satFatG: number | null;
  fruit: number;
  veg: number;
  grains: number;
  salt: number;
  sugarMix: number;
  sum: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function buildDayKeys(endDay: Date, days: number) {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dateKeyLocal(addDays(endDay, -i)));
  return keys;
}

function labelForTrendWindow(window: TrendWindow) {
  if (window === "weekly") return "Weekly";
  if (window === "monthly") return "Monthly";
  return "Yearly";
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function buildDailyTargets(goal: number | null) {
  const calorieTarget = goal && goal > 0 ? goal : 2000;
  return {
    calories: calorieTarget,
    carbsG: Math.round((calorieTarget * 0.5) / 4),
    proteinG: Math.round((calorieTarget * 0.2) / 4),
    fatG: Math.round((calorieTarget * 0.3) / 9),
    fruitServings: 2,
    grainsServings: 3,
    vegServings: 3,
    sugarG: Math.round((calorieTarget * 0.1) / 4),
    satFatG: Math.round((calorieTarget * 0.1) / 9),
  };
}

function buildPlanTargets(goal: number | null, planType: string | null) {
  const base = buildDailyTargets(goal);
  const type = (planType ?? "").toUpperCase();
  if (type === "MEDITERRANEAN") {
    return {
      ...base,
      fruitServings: 2,
      vegServings: 4,
      grainsServings: 3,
      sugarG: Math.round((base.calories * 0.08) / 4),
      satFatG: Math.round((base.calories * 0.08) / 9),
    };
  }
  return base;
}

function ratioLabel(recommended: number, actual: number | null, unit: string) {
  const rec = Number.isInteger(recommended) ? String(recommended) : recommended.toFixed(1);
  if (actual == null) return `Rec ${rec}${unit} / Act —`;
  const act = Number.isInteger(actual) ? String(actual) : actual.toFixed(1);
  return `Rec ${rec}${unit} / Act ${act}${unit}`;
}

function progressPct(target: number, actual: number | null, inverse = false) {
  if (actual == null || !Number.isFinite(actual) || target <= 0) return 0;
  if (inverse) {
    const pct = 100 - (actual / target) * 100;
    return Math.max(0, Math.min(100, pct));
  }
  const pct = (actual / target) * 100;
  return Math.max(0, Math.min(100, pct));
}

function chipFillStyle(pct: number): CSSProperties {
  return {
    "--chip-fill": `${pct}%`,
  } as CSSProperties;
}

function summarizeDay(list: Entry[], planId: string | null): DailySummary {
  const totals = { fruit: 0, veg: 0, grains: 0, salt: 0, sugar: 0 };
  const scores: number[] = [];
  let calories = 0;
  let carbsG = 0;
  let proteinG = 0;
  let fatG = 0;
  let sugarG = 0;
  let fiberG = 0;
  let satFatG = 0;
  let hasMacroData = false;
  let hasExtraNutrients = false;

  for (const e of list) {
    const b = bucketCountsFromEntry(e);
    totals.fruit += b.fruit;
    totals.veg += b.veg;
    totals.grains += b.grains;
    totals.salt += b.salt;
    totals.sugar += b.sugar;
    calories += entryCalories(e);
    const s = scoreForEntry(e, planId);
    if (typeof s === "number") scores.push(s);
    const grams = entryMacroGrams(e);
    if (grams) {
      hasMacroData = true;
      carbsG += grams.carbs;
      proteinG += grams.protein;
      fatG += grams.fat;
    }
    const extras = entryExtraNutrients(e);
    if (extras) {
      hasExtraNutrients = true;
      sugarG += extras.sugar;
      fiberG += extras.fiber;
      satFatG += extras.satFat;
    }
  }

  const sum = totals.fruit + totals.veg + totals.grains + totals.salt + totals.sugar;
  return {
    entries: list.length,
    score: avg(scores),
    calories: list.length ? Math.round(calories) : null,
    carbsG: hasMacroData ? Math.round(carbsG) : null,
    proteinG: hasMacroData ? Math.round(proteinG) : null,
    fatG: hasMacroData ? Math.round(fatG) : null,
    sugarG: hasExtraNutrients ? Math.round(sugarG) : null,
    fiberG: hasExtraNutrients ? Math.round(fiberG) : null,
    satFatG: hasExtraNutrients ? Math.round(satFatG) : null,
    fruit: Math.round(totals.fruit * 10) / 10,
    veg: Math.round(totals.veg * 10) / 10,
    grains: Math.round(totals.grains * 10) / 10,
    salt: Math.round(totals.salt * 10) / 10,
    sugarMix: Math.round(totals.sugar * 10) / 10,
    sum,
  };
}

function timeBucketFromHour(h: number) {
  if (h >= 5 && h <= 10) return "Morning";
  if (h >= 11 && h <= 14) return "Midday";
  if (h >= 15 && h <= 17) return "Afternoon";
  if (h >= 18 && h <= 21) return "Evening";
  return "Late night";
}

function extractChoiceText(entry: Entry) {
  const itemNames = Array.isArray(entry.parsed?.items)
    ? entry.parsed.items
        .map((i) => (typeof i?.name === "string" ? i.name.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];
  if (itemNames.length) return itemNames.join(" ");
  return String(entry.text ?? "").toLowerCase();
}

function toFiniteNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function entryCalories(entry: Entry) {
  const direct =
    toFiniteNumber(entry.calories) ??
    toFiniteNumber(entry.parsed?.calories) ??
    toFiniteNumber(entry.parsed?.kcal) ??
    toFiniteNumber(entry.parsed?.nutrition?.calories) ??
    toFiniteNumber(entry.parsed?.estimatedCalories);
  if (direct != null) return direct;

  // Fallback for older parsed payloads that only include per-item calories.
  if (Array.isArray(entry.parsed?.items) && entry.parsed.items.length) {
    let sum = 0;
    for (const item of entry.parsed.items) {
      const n = toFiniteNumber(item?.calories);
      if (n != null) sum += n;
    }
    if (sum > 0) return sum;
  }

  return 0;
}

function entryMacroGrams(entry: Entry) {
  const protein =
    toFiniteNumber(entry.proteinG) ??
    toFiniteNumber(entry.parsed?.proteinG) ??
    toFiniteNumber(entry.parsed?.macros?.proteinG);
  const carbs =
    toFiniteNumber(entry.carbsG) ??
    toFiniteNumber(entry.parsed?.carbsG) ??
    toFiniteNumber(entry.parsed?.macros?.carbsG);
  const fat =
    toFiniteNumber(entry.fatG) ??
    toFiniteNumber(entry.parsed?.fatG) ??
    toFiniteNumber(entry.parsed?.macros?.fatG);

  if (protein != null || carbs != null || fat != null) {
    return { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  }

  if (Array.isArray(entry.parsed?.items) && entry.parsed.items.length) {
    let p = 0;
    let c = 0;
    let f = 0;
    let found = false;
    for (const item of entry.parsed.items) {
      const ip = toFiniteNumber((item as any)?.proteinG);
      const ic = toFiniteNumber((item as any)?.carbsG);
      const ifat = toFiniteNumber((item as any)?.fatG);
      if (ip != null) {
        p += ip;
        found = true;
      }
      if (ic != null) {
        c += ic;
        found = true;
      }
      if (ifat != null) {
        f += ifat;
        found = true;
      }
    }
    if (found) return { protein: p, carbs: c, fat: f };
  }

  return null;
}

function entryExtraNutrients(entry: Entry) {
  const sugar =
    toFiniteNumber(entry.parsed?.nutrition?.sugarG) ??
    toFiniteNumber((entry.parsed as any)?.sugarG);
  const fiber =
    toFiniteNumber(entry.parsed?.nutrition?.fiberG) ??
    toFiniteNumber((entry.parsed as any)?.fiberG);
  const satFat =
    toFiniteNumber(entry.parsed?.nutrition?.satFatG) ??
    toFiniteNumber((entry.parsed as any)?.satFatG);

  if (sugar != null || fiber != null || satFat != null) {
    return { sugar: sugar ?? 0, fiber: fiber ?? 0, satFat: satFat ?? 0 };
  }

  if (Array.isArray(entry.parsed?.items) && entry.parsed.items.length) {
    let s = 0;
    let fi = 0;
    let sf = 0;
    let found = false;
    for (const item of entry.parsed.items) {
      const is = toFiniteNumber(item?.sugarG);
      const ifi = toFiniteNumber(item?.fiberG);
      const isf = toFiniteNumber(item?.satFatG);
      const servings = Math.max(0.25, toFiniteNumber(item?.servings) ?? 1);
      const name = typeof item?.name === "string" ? item.name.toLowerCase() : "";
      const tags = Array.isArray(item?.tags)
        ? item.tags.filter((t): t is string => typeof t === "string").join(" ").toLowerCase()
        : "";
      const merged = `${name} ${tags}`.trim();
      const group = normalizeFoodGroup(item?.foodGroup);
      const inferredGroup = inferGroupFromText(merged);
      const finalGroup = group === "other" ? inferredGroup : group;
      if (is != null) {
        s += is;
        found = true;
      } else if (finalGroup === "fruit") {
        // Fallback for older photo/text parses that identified fruit items but did not return sugar grams.
        // Use a conservative per-serving estimate so fruit bowls don't incorrectly show zero sugar.
        s += 9 * servings;
        found = true;
      }
      if (ifi != null) {
        fi += ifi;
        found = true;
      }
      if (isf != null) {
        sf += isf;
        found = true;
      }
    }
    if (found) return { sugar: s, fiber: fi, satFat: sf };
  }

  return null;
}

function pickPrimaryPlan(entries: Entry[]): Plan | null {
  const uniq = new Map<string, Plan>();
  for (const e of entries) for (const s of e.scores ?? []) uniq.set(s.plan.id, s.plan);
  const plans = Array.from(uniq.values());
  if (plans.length === 0) return null;
  return plans.find((p) => p.type === "MEDITERRANEAN") ?? plans[0];
}

function scoreForEntry(e: Entry, planId: string | null) {
  if (!planId) return null;
  const s = (e.scores ?? []).find((x) => x.plan.id === planId)?.score;
  return typeof s === "number" ? s : null;
}

function buildEntrySignalText(e: Entry) {
  const parsedTitle = typeof e.parsed?.title === "string" ? e.parsed.title : "";
  const itemNames = Array.isArray(e.parsed?.items)
    ? e.parsed.items.map((i) => (typeof i?.name === "string" ? i.name : "")).join(" ")
    : "";
  const itemTags = Array.isArray(e.parsed?.items)
    ? e.parsed.items
        .flatMap((i) => (Array.isArray(i?.tags) ? i.tags : []))
        .filter((t): t is string => typeof t === "string")
        .join(" ")
    : "";
  const dietTags = Array.isArray(e.parsed?.dietTags)
    ? e.parsed.dietTags.filter((t): t is string => typeof t === "string").join(" ")
    : "";
  return `${e.text || ""} ${parsedTitle} ${itemNames} ${itemTags} ${dietTags}`.toLowerCase();
}

function containsAny(text: string, terms: string[]) {
  return terms.some((t) => text.includes(t));
}

const fruitTerms = [
    "fruit",
    "fruit salad",
    "apple",
    "banana",
    "berry",
    "berries",
    "orange",
    "grape",
    "grapes",
    "pear",
    "peach",
    "pineapple",
    "mango",
    "strawberry",
    "blueberry",
    "raspberry",
    "kiwi",
    "watermelon",
    "melon",
    "citrus",
  ];
const vegTerms = [
    "vegetable",
    "veggies",
    "veg",
    "salad",
    "spinach",
    "broccoli",
    "carrot",
    "pepper",
    "tomato",
    "cucumber",
    "lettuce",
    "onion",
    "zucchini",
    "asparagus",
    "kale",
    "cauliflower",
    "greens",
  ];
const grainTerms = [
    "grain",
    "whole grain",
    "whole-grain",
    "oat",
    "oats",
    "oatmeal",
    "barley",
    "quinoa",
    "brown rice",
    "rice",
    "pasta",
    "noodle",
    "bread",
    "toast",
    "tortilla",
    "wrap",
    "cereal",
    "granola",
    "cracker",
  ];
const saltTerms = [
    "salt",
    "salty",
    "sodium",
    "soy sauce",
    "teriyaki",
    "pickle",
    "pickled",
    "cured",
    "processed meat",
    "bacon",
    "ham",
    "jerky",
    "chips",
    "pretzel",
    "ramen",
  ];
const sugarTerms = [
    "sugar",
    "sugary",
    "sweet",
    "dessert",
    "candy",
    "cookie",
    "cake",
    "pastry",
    "donut",
    "doughnut",
    "ice cream",
    "chocolate",
    "soda",
    "juice",
    "sweetened",
    "syrup",
    "honey",
    "jam",
  ];

function normalizeFoodGroup(v: unknown) {
  const x = String(v ?? "").toLowerCase().trim();
  if (x === "fruit") return "fruit";
  if (x === "vegetable" || x === "veg" || x === "veggies") return "veg";
  if (x === "grain" || x === "whole_grain" || x === "whole grain") return "grains";
  return "other";
}

function inferGroupFromText(text: string) {
  if (containsAny(text, fruitTerms)) return "fruit";
  if (containsAny(text, vegTerms)) return "veg";
  if (containsAny(text, grainTerms)) return "grains";
  return null;
}

function bucketCountsFromEntry(entry: Entry) {
  const items = Array.isArray(entry.parsed?.items) ? entry.parsed.items : [];
  if (items.length) {
    const totals = { fruit: 0, veg: 0, grains: 0, salt: 0, sugar: 0 };

    for (const item of items) {
      const name = typeof item?.name === "string" ? item.name.toLowerCase() : "";
      const tags = Array.isArray(item?.tags)
        ? item.tags.filter((t): t is string => typeof t === "string").join(" ").toLowerCase()
        : "";
      const merged = `${name} ${tags}`.trim();
      const servings = Math.max(0.25, toFiniteNumber(item?.servings) ?? 1);
      const group = normalizeFoodGroup(item?.foodGroup);
      const inferredGroup = inferGroupFromText(merged);

      const finalGroup =
        group === "other" ? inferredGroup : group;

      if (finalGroup === "fruit") totals.fruit += servings;
      if (finalGroup === "veg") totals.veg += servings;
      if (finalGroup === "grains") totals.grains += servings;

      const sodiumMg = toFiniteNumber(item?.sodiumMg) ?? 0;
      const sugarG = toFiniteNumber(item?.sugarG) ?? 0;
      const addedSugarG = toFiniteNumber(item?.addedSugarG) ?? 0;

      if (sodiumMg > 0) totals.salt += Math.min(2, sodiumMg / 300) * servings;
      else if (containsAny(merged, saltTerms)) totals.salt += 0.8 * servings;

      if (sugarG > 0) totals.sugar += Math.min(2, sugarG / 10) * servings;
      else if (addedSugarG > 0) totals.sugar += Math.min(2, addedSugarG / 8) * servings;
      else if (containsAny(merged, sugarTerms)) totals.sugar += 0.8 * servings;
    }

    return {
      fruit: Math.round(totals.fruit * 10) / 10,
      veg: Math.round(totals.veg * 10) / 10,
      grains: Math.round(totals.grains * 10) / 10,
      salt: Math.round(totals.salt * 10) / 10,
      sugar: Math.round(totals.sugar * 10) / 10,
    };
  }

  const t = buildEntrySignalText(entry);
  return {
    fruit: containsAny(t, fruitTerms) ? 1 : 0,
    veg: containsAny(t, vegTerms) ? 1 : 0,
    grains: containsAny(t, grainTerms) ? 1 : 0,
    salt: containsAny(t, saltTerms) ? 1 : 0,
    sugar: containsAny(t, sugarTerms) ? 1 : 0,
  };
}

function Sparkline({
  values,
  min,
  max,
  formatValue,
}: {
  values: Array<number | null>;
  min: number;
  max: number;
  formatValue?: (v: number) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pts = useMemo(() => {
    const w = 420;
    const h = 110;
    const pad = 12;

    const xs = values.map((_, i) => {
      const t = values.length <= 1 ? 0 : i / (values.length - 1);
      return pad + t * (w - pad * 2);
    });

    const ys = values.map((v) => {
      const vv = v == null ? null : clamp(v, min, max);
      if (vv == null) return null;
      const t = (vv - min) / (max - min || 1);
      return pad + (1 - t) * (h - pad * 2);
    });

    const path = ys
      .map((y, i) => {
        if (y == null) return "";
        const cmd = i === 0 || ys[i - 1] == null ? "M" : "L";
        return `${cmd} ${xs[i].toFixed(1)} ${y.toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

    return { w, h, pad, xs, ys, path };
  }, [values, min, max]);

  return (
    <svg className={styles.spark} viewBox={`0 0 ${pts.w} ${pts.h}`} aria-hidden="true">
      <path d={`M ${pts.pad} ${pts.h - pts.pad} H ${pts.w - pts.pad}`} className={styles.axis} />
      <path d={pts.path} className={styles.line} fill="none" />
      {pts.ys.map((y, i) =>
        y == null ? null : (
          <circle
            key={i}
            cx={pts.xs[i]}
            cy={y}
            r="3.2"
            className={styles.dot}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={() => setActiveIndex(i)}
          >
            <title>
              {formatValue ? formatValue(values[i] as number) : String(Math.round(values[i] as number))}
            </title>
          </circle>
        )
      )}
      {activeIndex != null &&
      pts.ys[activeIndex] != null &&
      values[activeIndex] != null ? (
        <g>
          <rect
            className={styles.dotTooltipBg}
            x={Math.max(6, pts.xs[activeIndex] - 34)}
            y={Math.max(2, (pts.ys[activeIndex] as number) - 24)}
            width={68}
            height={16}
            rx={6}
          />
          <text
            className={styles.dotTooltipText}
            x={pts.xs[activeIndex]}
            y={Math.max(13, (pts.ys[activeIndex] as number) - 12)}
            textAnchor="middle"
          >
            {formatValue
              ? formatValue(values[activeIndex] as number)
              : String(Math.round(values[activeIndex] as number))}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export default function CoachPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // Q&A
  const [question, setQuestion] = useState("");
  const [quickQuestion, setQuickQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("weekly");
  const [showTrendMore, setShowTrendMore] = useState(false);
  const [breakdownDays, setBreakdownDays] = useState(2);
  const [showAdditionalMore, setShowAdditionalMore] = useState(false);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = useMemo(() => dateKeyLocal(today), [today]);

  const load = useCallback(async () => {
    setBootError(null);
    setLoading(true);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const meData = await meRes.json().catch(() => ({}));
      setMe(meData?.user ?? null);

      const eRes = await fetch("/api/entries", { cache: "no-store" });
      const eData = await eRes.json().catch(() => ({}));
      setEntries(Array.isArray(eData?.entries) ? eData.entries : []);
    } catch (err: any) {
      setBootError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const primaryPlan = useMemo(() => pickPrimaryPlan(entries), [entries]);
  const planId = primaryPlan?.id ?? null;

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = dateKeyLocal(startOfLocalDay(new Date(e.createdAt)));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    for (const [k, list] of m.entries()) {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      m.set(k, list);
    }
    return m;
  }, [entries]);

  const trendDays = useMemo(() => {
    if (trendWindow === "monthly") return 30;
    if (trendWindow === "yearly") return 365;
    return 7;
  }, [trendWindow]);

  const trendKeys = useMemo(() => buildDayKeys(today, trendDays), [today, trendDays]);
  const previousTrendKeys = useMemo(
    () => buildDayKeys(addDays(today, -trendDays), trendDays),
    [today, trendDays]
  );

  const breakdownKeys = useMemo(() => buildDayKeys(today, breakdownDays), [today, breakdownDays]);
  const buildSeriesForKeys = useCallback(
    (keys: string[]) => {
      const scoreVals: Array<number | null> = [];
      const calVals: Array<number | null> = [];
      for (const k of keys) {
        const s = summarizeDay(byDay.get(k) ?? [], planId);
        scoreVals.push(s.score);
        calVals.push(s.calories);
      }
      return { scoreVals, calVals };
    },
    [byDay, planId]
  );

  const trendSeries = useMemo(() => buildSeriesForKeys(trendKeys), [buildSeriesForKeys, trendKeys]);
  const previousTrendSeries = useMemo(
    () => buildSeriesForKeys(previousTrendKeys),
    [buildSeriesForKeys, previousTrendKeys]
  );

  const breakdownRows = useMemo(() => {
    return breakdownKeys.map((k) => {
      const list = byDay.get(k) ?? [];
      const s = summarizeDay(list, planId);
      return {
        key: k,
        fruit: s.fruit,
        veg: s.veg,
        grains: s.grains,
        salt: s.salt,
        sugar: s.sugarMix,
        sum: s.sum,
        entries: s.entries,
        calories: s.calories,
        carbsG: s.carbsG,
        proteinG: s.proteinG,
        fatG: s.fatG,
        sugarG: s.sugarG,
        fiberG: s.fiberG,
        satFatG: s.satFatG,
      };
    });
  }, [byDay, breakdownKeys, planId]);

  // =========================
  // NEW: small insights between sections
  // =========================
  function trendInsight(
    scoreVals: Array<number | null>,
    calVals: Array<number | null>,
    goal: number | null,
    days: number,
    window: TrendWindow
  ) {
    const scores = scoreVals.filter((x): x is number => typeof x === "number");
    const cals = calVals.filter((x): x is number => typeof x === "number");
    const loggedDays = scoreVals.filter((x) => x != null).length;

    if (scores.length < 2) {
      return `${labelForTrendWindow(window)} insight: log a few more days and I’ll summarize your trend with clearer context.`;
    }

    const first = scores[0];
    const last = scores[scores.length - 1];
    const delta = last - first;
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const best = Math.round(Math.max(...scores));
    const worst = Math.round(Math.min(...scores));

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const std = Math.sqrt(variance);

    const direction =
      Math.abs(delta) < 3 ? "pretty steady" : delta > 0 ? "trending up" : "trending down";

    const steadiness =
      std < 8 ? "and very consistent" : std < 14 ? "with some normal swings" : "with bigger day-to-day swings";

    let calLine = "";
    if (cals.length) {
      const calAvg = Math.round(cals.reduce((a, b) => a + b, 0) / cals.length);
      if (goal) {
        const diff = calAvg - goal;
        calLine =
          Math.abs(diff) <= 150
            ? " Calories look close to your goal on average."
            : diff > 0
            ? " Calories are running a bit above your goal on average."
            : " Calories are running a bit below your goal on average.";
      } else {
        calLine = ` Average calories are about ${calAvg}/day on logged days.`;
      }
    }

    return `${labelForTrendWindow(window)} insight (${days} days): score is ${direction} (${Math.round(first)} → ${Math.round(last)}), averaging ${avgScore}/100 ${steadiness}. Best ${best}, lowest ${worst}. Logged ${loggedDays}/${days} days.${calLine}`;
  }

  function foodMixInsight(
    rows: Array<{ fruit: number; veg: number; grains: number; salt: number; sugar: number; sum: number }>,
    days: number
  ) {
    const active = rows.filter((r) => r.sum > 0);
    if (!active.length) return "Log a few meals and I’ll summarize your food-group pattern.";
    const zero = { fruit: 0, veg: 0, grains: 0, salt: 0, sugar: 0, sum: 0 };
    const totals = active.reduce(
      (a, r) => ({
        fruit: a.fruit + r.fruit,
        veg: a.veg + r.veg,
        grains: a.grains + r.grains,
        salt: a.salt + r.salt,
        sugar: a.sugar + r.sugar,
        sum: a.sum + r.sum,
      }),
      zero
    );

    const avgPerDay = {
      fruit: round1(totals.fruit / active.length),
      veg: round1(totals.veg / active.length),
      grains: round1(totals.grains / active.length),
      salt: round1(totals.salt / active.length),
      sugar: round1(totals.sugar / active.length),
    };

    const pct = (n: number) => Math.round((n / (totals.sum || 1)) * 100);
    const shares = {
      fruit: pct(totals.fruit),
      veg: pct(totals.veg),
      grains: pct(totals.grains),
      salt: pct(totals.salt),
      sugar: Math.max(0, 100 - pct(totals.fruit) - pct(totals.veg) - pct(totals.grains) - pct(totals.salt)),
    };

    const mid = Math.max(1, Math.floor(active.length / 2));
    const firstHalf = active.slice(0, mid);
    const secondHalf = active.slice(mid);
    const sumHalf = (arr: typeof active) =>
      arr.reduce(
        (a, r) => ({
          fruit: a.fruit + r.fruit,
          veg: a.veg + r.veg,
          grains: a.grains + r.grains,
          salt: a.salt + r.salt,
          sugar: a.sugar + r.sugar,
          sum: a.sum + r.sum,
        }),
        zero
      );
    const a = sumHalf(firstHalf);
    const b = secondHalf.length ? sumHalf(secondHalf) : a;
    const share = (part: number, total: number) => (total > 0 ? part / total : 0);
    const trend = {
      fruit: Math.round((share(b.fruit, b.sum) - share(a.fruit, a.sum)) * 100),
      veg: Math.round((share(b.veg, b.sum) - share(a.veg, a.sum)) * 100),
      grains: Math.round((share(b.grains, b.sum) - share(a.grains, a.sum)) * 100),
      salt: Math.round((share(b.salt, b.sum) - share(a.salt, a.sum)) * 100),
      sugar: Math.round((share(b.sugar, b.sum) - share(a.sugar, a.sum)) * 100),
    };

    const continueNotes: string[] = [];
    if (shares.veg >= 25 || trend.veg >= 4) continueNotes.push("Vegetable coverage is a strength, keep that pattern.");
    if (shares.fruit >= 15 || trend.fruit >= 4) continueNotes.push("Fruit intake is trending well, continue it.");
    if (shares.grains >= 15 && shares.grains <= 35) continueNotes.push("Grain balance looks reasonable this week.");

    const improveNotes: string[] = [];
    if (shares.veg < 18) improveNotes.push("Add 1 more vegetable serving to one meal each day.");
    if (shares.fruit < 10) improveNotes.push("Add a fruit serving to breakfast or snacks.");
    if (shares.sugar > 22 || trend.sugar >= 4) improveNotes.push("Reduce sugar-heavy choices in the second half of the week.");
    if (shares.salt > 20 || trend.salt >= 4) improveNotes.push("Lower salty add-ons and packaged foods at one meal/day.");

    if (!continueNotes.length) continueNotes.push("Overall consistency is good, keep logging complete meals.");
    if (!improveNotes.length) improveNotes.push("Main opportunity: shift one grain serving toward vegetables on low-veg days.");

    const trendLabel = (n: number) => (Math.abs(n) <= 2 ? "steady" : n > 0 ? `up ${n}pts` : `down ${Math.abs(n)}pts`);

    return [
      `${days}-day pattern: Veg ${shares.veg}%, Fruit ${shares.fruit}%, Grains ${shares.grains}%, Sugar ${shares.sugar}%, Salt ${shares.salt}% (avg/day: V ${avgPerDay.veg}, F ${avgPerDay.fruit}, G ${avgPerDay.grains}).`,
      `Trends: Veg ${trendLabel(trend.veg)}, Fruit ${trendLabel(trend.fruit)}, Sugar ${trendLabel(trend.sugar)}.`,
      `Continue: ${continueNotes[0]}`,
      `Improve: ${improveNotes[0]}`,
    ].join("\n");
  }

  const trendSummaryText = useMemo(
    () =>
      trendInsight(
        trendSeries.scoreVals,
        trendSeries.calVals,
        me?.dailyCalorieGoal ?? null,
        trendDays,
        trendWindow
      ),
    [trendSeries.scoreVals, trendSeries.calVals, me?.dailyCalorieGoal, trendDays, trendWindow]
  );

  const foodSummaryText = useMemo(
    () => foodMixInsight(breakdownRows, breakdownDays),
    [breakdownRows, breakdownDays]
  );
  const dailyTargets = useMemo(
    () => buildPlanTargets(me?.dailyCalorieGoal ?? null, primaryPlan?.type ?? null),
    [me?.dailyCalorieGoal, primaryPlan?.type]
  );
  const periodRows = useMemo(
    () => trendKeys.map((k) => ({ key: k, ...summarizeDay(byDay.get(k) ?? [], planId) })),
    [trendKeys, byDay, planId]
  );
  const loggedPeriodDays = useMemo(
    () => periodRows.filter((r) => r.entries > 0).length,
    [periodRows]
  );
  const loggingStreak = useMemo(() => {
    let streak = 0;
    for (let i = trendKeys.length - 1; i >= 0; i--) {
      const r = periodRows[i];
      if (!r || r.entries === 0) break;
      streak += 1;
    }
    return streak;
  }, [periodRows, trendKeys.length]);
  const consistencyPct = useMemo(
    () => Math.round((loggedPeriodDays / Math.max(1, trendDays)) * 100),
    [loggedPeriodDays, trendDays]
  );
  const trendCompareText = useMemo(() => {
    const curScores = trendSeries.scoreVals.filter((x): x is number => typeof x === "number");
    const prevScores = previousTrendSeries.scoreVals.filter((x): x is number => typeof x === "number");
    const curCals = trendSeries.calVals.filter((x): x is number => typeof x === "number");
    const prevCals = previousTrendSeries.calVals.filter((x): x is number => typeof x === "number");
    const curScoreAvg = curScores.length ? Math.round(curScores.reduce((a, b) => a + b, 0) / curScores.length) : null;
    const prevScoreAvg = prevScores.length ? Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length) : null;
    const curCalAvg = curCals.length ? Math.round(curCals.reduce((a, b) => a + b, 0) / curCals.length) : null;
    const prevCalAvg = prevCals.length ? Math.round(prevCals.reduce((a, b) => a + b, 0) / prevCals.length) : null;
    if (curScoreAvg == null || prevScoreAvg == null) {
      return `${labelForTrendWindow(trendWindow)} compare: not enough history for a reliable previous-period comparison yet.`;
    }
    const scoreDelta = curScoreAvg - prevScoreAvg;
    const calDelta = curCalAvg != null && prevCalAvg != null ? curCalAvg - prevCalAvg : null;
    const scoreDir = Math.abs(scoreDelta) <= 1 ? "flat" : scoreDelta > 0 ? "up" : "down";
    const calLine =
      calDelta == null
        ? ""
        : calDelta === 0
        ? " Calories are unchanged."
        : calDelta > 0
        ? ` Calories are up ${calDelta}/day.`
        : ` Calories are down ${Math.abs(calDelta)}/day.`;
    return `${labelForTrendWindow(trendWindow)} compare: score is ${scoreDir} ${Math.abs(scoreDelta)} points vs previous ${trendDays} days (${prevScoreAvg} → ${curScoreAvg}).${calLine}`;
  }, [trendSeries.scoreVals, trendSeries.calVals, previousTrendSeries.scoreVals, previousTrendSeries.calVals, trendWindow, trendDays]);
  const winsAndDrags = useMemo(() => {
    const safeAvg = (vals: Array<number | null>) => {
      const nums = vals.filter((x): x is number => typeof x === "number");
      if (!nums.length) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };
    const scoreAvg = safeAvg(periodRows.map((r) => r.score));
    const fruitAvg = safeAvg(periodRows.map((r) => (r.entries ? r.fruit : null)));
    const vegAvg = safeAvg(periodRows.map((r) => (r.entries ? r.veg : null)));
    const grainsAvg = safeAvg(periodRows.map((r) => (r.entries ? r.grains : null)));
    const fatAvg = safeAvg(periodRows.map((r) => r.fatG));
    const sugarAvg = safeAvg(periodRows.map((r) => r.sugarG));
    const satFatAvg = safeAvg(periodRows.map((r) => r.satFatG));
    const wins: Array<{ label: string; value: number }> = [];
    const drags: Array<{ label: string; value: number }> = [];
    if (scoreAvg != null) wins.push({ label: `Average score ${Math.round(scoreAvg)}/100`, value: scoreAvg / 100 });
    if (vegAvg != null) {
      const ratio = vegAvg / Math.max(0.1, dailyTargets.vegServings);
      (ratio >= 0.85 ? wins : drags).push({
        label: `Vegetables ${round1(vegAvg)} serv/day vs target ${dailyTargets.vegServings}`,
        value: ratio,
      });
    }
    if (fruitAvg != null) {
      const ratio = fruitAvg / Math.max(0.1, dailyTargets.fruitServings);
      (ratio >= 0.85 ? wins : drags).push({
        label: `Fruit ${round1(fruitAvg)} serv/day vs target ${dailyTargets.fruitServings}`,
        value: ratio,
      });
    }
    if (grainsAvg != null) {
      const ratio = grainsAvg / Math.max(0.1, dailyTargets.grainsServings);
      (ratio >= 0.6 && ratio <= 1.3 ? wins : drags).push({
        label: `Grains ${round1(grainsAvg)} serv/day vs target ${dailyTargets.grainsServings}`,
        value: 1 - Math.abs(1 - ratio),
      });
    }
    if (fatAvg != null) {
      const ratio = fatAvg / Math.max(1, dailyTargets.fatG);
      (ratio <= 1.15 ? wins : drags).push({
        label: `Fat ${Math.round(fatAvg)}g/day vs target ${dailyTargets.fatG}g`,
        value: 1 - Math.abs(1 - ratio),
      });
    }
    if (sugarAvg != null) {
      const ratio = sugarAvg / Math.max(1, dailyTargets.sugarG);
      (ratio <= 1 ? wins : drags).push({
        label: `Sugar ${Math.round(sugarAvg)}g/day vs target ${dailyTargets.sugarG}g`,
        value: 1 - Math.abs(1 - ratio),
      });
    }
    if (satFatAvg != null) {
      const ratio = satFatAvg / Math.max(1, dailyTargets.satFatG);
      (ratio <= 1 ? wins : drags).push({
        label: `Sat fat ${Math.round(satFatAvg)}g/day vs target ${dailyTargets.satFatG}g`,
        value: 1 - Math.abs(1 - ratio),
      });
    }
    wins.sort((a, b) => b.value - a.value);
    drags.sort((a, b) => a.value - b.value);
    return {
      wins: wins.slice(0, 3).map((x) => x.label),
      drags: drags.slice(0, 3).map((x) => x.label),
    };
  }, [periodRows, dailyTargets]);
  const confidenceSummary = useMemo(() => {
    const scoreCoverage = Math.round(
      (trendSeries.scoreVals.filter((x) => x != null).length / Math.max(1, trendDays)) * 100
    );
    const calorieCoverage = Math.round(
      (trendSeries.calVals.filter((x) => x != null).length / Math.max(1, trendDays)) * 100
    );
    const nutrientCoverage = Math.round(
      (periodRows.filter((r) => r.sugarG != null && r.satFatG != null && r.fatG != null).length /
        Math.max(1, trendDays)) *
        100
    );
    const overall = Math.round((scoreCoverage + calorieCoverage + nutrientCoverage) / 3);
    const level = overall >= 80 ? "High" : overall >= 55 ? "Medium" : "Low";
    return { level, overall, scoreCoverage, calorieCoverage, nutrientCoverage };
  }, [trendSeries.scoreVals, trendSeries.calVals, periodRows, trendDays]);
  const goalHitRate = useMemo(() => {
    const inRange = (actual: number, target: number, tol = 0.15) => {
      const min = target * (1 - tol);
      const max = target * (1 + tol);
      return actual >= min && actual <= max;
    };
    const sugarInRange = (actual: number, target: number) => actual <= target;

    const stats = {
      carbs: { hit: 0, seen: 0 },
      protein: { hit: 0, seen: 0 },
      fat: { hit: 0, seen: 0 },
      sugar: { hit: 0, seen: 0 },
    };

    for (const d of periodRows) {
      if (d.entries === 0) continue;

      if (d.carbsG != null) {
        stats.carbs.seen += 1;
        if (inRange(d.carbsG, dailyTargets.carbsG)) stats.carbs.hit += 1;
      }
      if (d.proteinG != null) {
        stats.protein.seen += 1;
        if (inRange(d.proteinG, dailyTargets.proteinG)) stats.protein.hit += 1;
      }
      if (d.fatG != null) {
        stats.fat.seen += 1;
        if (inRange(d.fatG, dailyTargets.fatG)) stats.fat.hit += 1;
      }
      if (d.sugarG != null) {
        stats.sugar.seen += 1;
        if (sugarInRange(d.sugarG, dailyTargets.sugarG)) stats.sugar.hit += 1;
      }
    }

    const pct = (x: { hit: number; seen: number }) =>
      x.seen ? Math.round((x.hit / x.seen) * 100) : null;

    const carbsPct = pct(stats.carbs);
    const proteinPct = pct(stats.protein);
    const fatPct = pct(stats.fat);
    const sugarPct = pct(stats.sugar);

    const valid = [carbsPct, proteinPct, fatPct, sugarPct].filter(
      (v): v is number => typeof v === "number"
    );

    return {
      carbsPct,
      proteinPct,
      fatPct,
      sugarPct,
      carbsSeen: stats.carbs.seen,
      proteinSeen: stats.protein.seen,
      fatSeen: stats.fat.seen,
      sugarSeen: stats.sugar.seen,
      overall: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
    };
  }, [periodRows, dailyTargets]);
  const dowConsistency = useMemo(() => {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byDow = names.map((name, idx) => ({
      idx,
      name,
      possible: 0,
      logged: 0,
      pct: 0,
    }));

    for (let i = 0; i < trendKeys.length; i++) {
      const key = trendKeys[i];
      const d = new Date(`${key}T12:00:00`);
      const dow = d.getDay();
      byDow[dow].possible += 1;
      if ((periodRows[i]?.entries ?? 0) > 0) byDow[dow].logged += 1;
    }

    for (const row of byDow) {
      row.pct = row.possible ? Math.round((row.logged / row.possible) * 100) : 0;
    }

    // Monday-first display
    return [1, 2, 3, 4, 5, 6, 0].map((i) => byDow[i]);
  }, [trendKeys, periodRows]);
  const habitLoopSummary = useMemo(() => {
    const scopedEntries: Entry[] = [];
    for (const k of trendKeys) {
      const list = byDay.get(k) ?? [];
      scopedEntries.push(...list);
    }
    if (!scopedEntries.length) {
      return "Log a few meals and I’ll detect your trigger time -> choice -> outcome pattern.";
    }

    const byBucket = new Map<
      string,
      { count: number; scoreSum: number; scoreSeen: number; calSum: number; topChoices: Record<string, number> }
    >();
    const stop = new Set([
      "and", "with", "the", "a", "an", "to", "for", "of", "on", "in", "at", "from", "meal", "food",
      "my", "is", "was", "it", "this", "that", "plus", "today",
    ]);

    for (const e of scopedEntries) {
      const d = new Date(e.createdAt);
      if (!Number.isFinite(d.getTime())) continue;
      const bucket = timeBucketFromHour(d.getHours());
      if (!byBucket.has(bucket)) {
        byBucket.set(bucket, {
          count: 0,
          scoreSum: 0,
          scoreSeen: 0,
          calSum: 0,
          topChoices: {},
        });
      }
      const row = byBucket.get(bucket)!;
      row.count += 1;
      row.calSum += entryCalories(e);
      const s = scoreForEntry(e, planId);
      if (typeof s === "number") {
        row.scoreSeen += 1;
        row.scoreSum += s;
      }

      const tokens = extractChoiceText(e)
        .split(/[^a-z0-9]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !stop.has(t));
      for (const t of tokens.slice(0, 6)) {
        row.topChoices[t] = (row.topChoices[t] ?? 0) + 1;
      }
    }

    const ranked = Array.from(byBucket.entries())
      .map(([bucket, v]) => {
        const topChoice = Object.entries(v.topChoices).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed meals";
        return {
          bucket,
          count: v.count,
          scoreAvg: v.scoreSeen ? Math.round(v.scoreSum / v.scoreSeen) : null,
          calAvg: v.count ? Math.round(v.calSum / v.count) : null,
          topChoice,
        };
      })
      .sort((a, b) => b.count - a.count);

    const lead = ranked[0];
    if (!lead) return "Log a few meals and I’ll detect your trigger time -> choice -> outcome pattern.";
    const scoreLine =
      lead.scoreAvg == null
        ? "score data is still sparse"
        : lead.scoreAvg >= 75
        ? `this tends to score well (${lead.scoreAvg}/100)`
        : `this pattern tends to drag score (${lead.scoreAvg}/100)`;
    return `Trigger: ${lead.bucket}. Choice: ${lead.topChoice}. Result: about ${lead.calAvg ?? "—"} kcal/entry and ${scoreLine}.`;
  }, [trendKeys, byDay, planId]);
  const momentumSummary = useMemo(() => {
    const avgNum = (vals: Array<number | null>) => {
      const nums = vals.filter((x): x is number => typeof x === "number");
      if (!nums.length) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };
    const curScore = avgNum(trendSeries.scoreVals);
    const prevScore = avgNum(previousTrendSeries.scoreVals);
    const curLog = periodRows.filter((r) => r.entries > 0).length / Math.max(1, trendDays);
    const prevRows = previousTrendKeys.map((k) => summarizeDay(byDay.get(k) ?? [], planId));
    const prevLog = prevRows.filter((r) => r.entries > 0).length / Math.max(1, trendDays);
    if (curScore == null || prevScore == null) {
      return "Momentum: not enough prior data to classify yet.";
    }
    const scoreDelta = Math.round(curScore - prevScore);
    const logDeltaPts = Math.round((curLog - prevLog) * 100);
    const label =
      scoreDelta >= 3 || (scoreDelta >= 1 && logDeltaPts >= 8)
        ? "Improving"
        : scoreDelta <= -3 || (scoreDelta <= -1 && logDeltaPts <= -8)
        ? "Slipping"
        : "Stable";
    return `Momentum: ${label}. Score ${scoreDelta >= 0 ? "+" : ""}${scoreDelta} vs previous ${trendDays} days, consistency ${logDeltaPts >= 0 ? "+" : ""}${logDeltaPts} pts.`;
  }, [trendSeries.scoreVals, previousTrendSeries.scoreVals, periodRows, trendDays, previousTrendKeys, byDay, planId]);
  const weekendWeekdaySummary = useMemo(() => {
    const summarize = (keys: string[]) => {
      const rows = keys.map((k) => summarizeDay(byDay.get(k) ?? [], planId));
      const logged = rows.filter((r) => r.entries > 0).length;
      const avgNum = (vals: Array<number | null>) => {
        const nums = vals.filter((x): x is number => typeof x === "number");
        if (!nums.length) return null;
        return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      };
      return {
        possible: keys.length,
        logged,
        consistency: Math.round((logged / Math.max(1, keys.length)) * 100),
        score: avgNum(rows.map((r) => r.score)),
        calories: avgNum(rows.map((r) => r.calories)),
        sugar: avgNum(rows.map((r) => r.sugarG)),
      };
    };

    const weekendKeys = trendKeys.filter((k) => {
      const d = new Date(`${k}T12:00:00`);
      const dow = d.getDay();
      return dow === 0 || dow === 6;
    });
    const weekdayKeys = trendKeys.filter((k) => {
      const d = new Date(`${k}T12:00:00`);
      const dow = d.getDay();
      return dow >= 1 && dow <= 5;
    });

    const wknd = summarize(weekendKeys);
    const wkdy = summarize(weekdayKeys);
    if (!wknd.logged && !wkdy.logged) {
      return "Weekend vs weekday: not enough logged days yet.";
    }

    const scoreDelta =
      wknd.score != null && wkdy.score != null ? wknd.score - wkdy.score : null;
    const calDelta =
      wknd.calories != null && wkdy.calories != null ? wknd.calories - wkdy.calories : null;
    const sugarDelta =
      wknd.sugar != null && wkdy.sugar != null ? wknd.sugar - wkdy.sugar : null;
    const consistencyDelta = wknd.consistency - wkdy.consistency;

    return `Weekend vs weekday: score ${wknd.score ?? "—"} vs ${wkdy.score ?? "—"} (${scoreDelta == null ? "n/a" : scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`}), calories ${wknd.calories ?? "—"} vs ${wkdy.calories ?? "—"}, sugar ${wknd.sugar ?? "—"}g vs ${wkdy.sugar ?? "—"}g, consistency ${wknd.consistency}% vs ${wkdy.consistency}% (${consistencyDelta >= 0 ? "+" : ""}${consistencyDelta}pts).`;
  }, [trendKeys, byDay, planId]);
  const lateNightImpactSummary = useMemo(() => {
    const isLateNight = (e: Entry) => {
      const d = new Date(e.createdAt);
      const h = d.getHours();
      return h >= 21 || h <= 4;
    };

    const lateNextScores: number[] = [];
    const normalNextScores: number[] = [];

    for (let i = 0; i < trendKeys.length - 1; i++) {
      const todayKey = trendKeys[i];
      const nextKey = trendKeys[i + 1];
      const dayEntries = byDay.get(todayKey) ?? [];
      const nextSummary = summarizeDay(byDay.get(nextKey) ?? [], planId);
      if (nextSummary.score == null) continue;
      const hadLate = dayEntries.some(isLateNight);
      if (hadLate) lateNextScores.push(nextSummary.score);
      else normalNextScores.push(nextSummary.score);
    }

    const avgScore = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const lateAvg = avgScore(lateNextScores);
    const normalAvg = avgScore(normalNextScores);

    if (lateAvg == null || normalAvg == null) {
      return "Late-night eating: not enough paired days yet to estimate next-day impact.";
    }
    const delta = lateAvg - normalAvg;
    const label =
      delta <= -3
        ? "Late-night entries are associated with lower next-day scores."
        : delta >= 3
        ? "Late-night entries are not hurting next-day scores in your current data."
        : "Late-night effect appears neutral right now.";
    return `Late-night eating: next-day score ${lateAvg} after late-night days vs ${normalAvg} after non-late days (${delta >= 0 ? "+" : ""}${delta}). ${label}`;
  }, [trendKeys, byDay, planId]);
  const exportSummaryText = useMemo(() => {
    return [
      `Coach Summary (${labelForTrendWindow(trendWindow)} ${trendDays}d)`,
      trendCompareText,
      `Habit loop: ${habitLoopSummary}`,
      `${momentumSummary}`,
      `Weekend vs weekday: ${weekendWeekdaySummary}`,
      `Late-night eating: ${lateNightImpactSummary}`,
      `Streak ${loggingStreak} days | Consistency ${consistencyPct}% | Confidence ${confidenceSummary.level} (${confidenceSummary.overall}%)`,
      `Top wins: ${winsAndDrags.wins.length ? winsAndDrags.wins.join(" | ") : "Not enough data yet"}`,
      `Top drags: ${winsAndDrags.drags.length ? winsAndDrags.drags.join(" | ") : "None flagged"}`,
      `Trend insight: ${trendSummaryText}`,
      `Food insight: ${foodSummaryText.replace(/\n/g, " ")}`,
    ].join("\n");
  }, [trendWindow, trendDays, trendCompareText, habitLoopSummary, momentumSummary, weekendWeekdaySummary, lateNightImpactSummary, loggingStreak, consistencyPct, confidenceSummary, winsAndDrags, trendSummaryText, foodSummaryText]);
  const xLabelStep = useMemo(() => {
    if (trendKeys.length <= 14) return 1;
    if (trendKeys.length <= 60) return 5;
    if (trendKeys.length <= 150) return 14;
    return 30;
  }, [trendKeys.length]);

  const trendLabelKeys = useMemo(
    () => trendKeys.filter((_, i) => i % xLabelStep === 0 || i === trendKeys.length - 1),
    [trendKeys, xLabelStep]
  );

  async function exportSummary() {
    try {
      const nav: any = typeof window !== "undefined" ? (window as any).navigator : null;
      if (nav?.share) {
        await nav.share({
          title: "Coach Summary",
          text: exportSummaryText,
        });
        return;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(exportSummaryText);
      }
    } catch {
      // no-op; keep action silent
    }
  }

  async function askCoach() {
    const q = question.trim();
    if (!q) return;

    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          horizonDays: 30,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Coach request failed");
      setAnswer(String(j?.answer ?? ""));
    } catch (err: any) {
      setAnswer(`Error: ${String(err?.message ?? err)}`);
    } finally {
      setAsking(false);
    }
  }

  async function askCoachQuick() {
    const q = quickQuestion.trim();
    if (!q) return;
    setAsking(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          horizonDays: 30,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Coach request failed");
      setAnswer(String(j?.answer ?? ""));
      setQuickQuestion("");
    } catch (err: any) {
      setAnswer(`Error: ${String(err?.message ?? err)}`);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.h1}>Coach</h1>
        <div className={styles.subtitle}>
          {primaryPlan?.name ? `Plan: ${primaryPlan.name}` : "Pick a plan to unlock plan-based coaching."}
        </div>
      </div>

      {bootError && (
        <div className={styles.error}>
          <strong>Load error:</strong> {bootError}
        </div>
      )}

      <div className={styles.grid}>
        {/* Trend */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>Diet Trend</div>
              <div className={styles.cardMeta}>
                {labelForTrendWindow(trendWindow)} view ({trendKeys[0]} → {trendKeys[trendKeys.length - 1]})
              </div>
            </div>
            <div className={styles.trendTabs} role="tablist" aria-label="Trend window">
              <button
                type="button"
                role="tab"
                aria-selected={trendWindow === "weekly"}
                className={`${styles.trendTab} ${trendWindow === "weekly" ? styles.trendTabActive : ""}`}
                onClick={() => setTrendWindow("weekly")}
              >
                Weekly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={trendWindow === "monthly"}
                className={`${styles.trendTab} ${trendWindow === "monthly" ? styles.trendTabActive : ""}`}
                onClick={() => setTrendWindow("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={trendWindow === "yearly"}
                className={`${styles.trendTab} ${trendWindow === "yearly" ? styles.trendTabActive : ""}`}
                onClick={() => setTrendWindow("yearly")}
              >
                Yearly
              </button>
            </div>
          </div>

          <div className={styles.chartGrid}>
            <div className={styles.chartBlock}>
              <div className={styles.chartLabelRow}>
                <span className={styles.chartLabel}>Calories</span>
                <span className={styles.chartValue}>
                  {me?.dailyCalorieGoal ? `Goal ${me.dailyCalorieGoal}` : "No goal"}
                </span>
              </div>

              <Sparkline
                values={trendSeries.calVals}
                min={0}
                max={Math.max(
                  500,
                  ...(trendSeries.calVals.filter((x): x is number => typeof x === "number") as number[]),
                  me?.dailyCalorieGoal ?? 0
                )}
                formatValue={(v) => `${Math.round(v)} kcal`}
              />
              <div className={styles.xLabels}>
                {trendLabelKeys.map((k) => (
                  <span key={k}>{k.slice(5)}</span>
                ))}
              </div>
            </div>

            <div className={styles.chartBlock}>
              <div className={styles.chartLabelRow}>
                <span className={styles.chartLabel}>Score</span>
                <span className={styles.chartValue}>
                  {avg(trendSeries.scoreVals.filter((x): x is number => typeof x === "number")) ?? "—"}/100
                </span>
              </div>
              <Sparkline values={trendSeries.scoreVals} min={0} max={100} formatValue={(v) => `${Math.round(v)}%`} />
              <div className={styles.xLabels}>
                {trendLabelKeys.map((k) => (
                  <span key={k}>{k.slice(5)}</span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.note}>
            Tip: Click into <a href="/log">Log</a> to add entries — the Coach page updates automatically.
          </div>
          <div className={styles.insightBox}>
            <div className={styles.answerTitle}>Trend insight</div>
            <div className={styles.answerText}>{trendSummaryText}</div>
          </div>
          <button
            type="button"
            className={styles.moreToggle}
            aria-expanded={showTrendMore}
            onClick={() => setShowTrendMore((v) => !v)}
          >
            <span className={styles.moreTriangle}>{showTrendMore ? "▲" : "▼"}</span> More
          </button>
          {showTrendMore && (
            <div className={styles.moreWrap}>
              <div className={styles.miniGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>
                    Streak + consistency
                    <span className={styles.inlineInfoWrap}>
                      <button type="button" className={styles.inlineInfoBtn} aria-label="Streak and consistency explanation">
                        i
                      </button>
                      <span className={styles.inlineInfoBubble} role="tooltip">
                        Streak is consecutive logged days. Consistency is logged days divided by total days in this selected period.
                      </span>
                    </span>
                  </div>
                  <div className={styles.answerText}>
                    Streak: <strong>{loggingStreak} days</strong>
                    {"\n"}
                    Consistency: <strong>{consistencyPct}%</strong> ({loggedPeriodDays}/{trendDays} days logged)
                  </div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>
                    Confidence
                    <span className={styles.inlineInfoWrap}>
                      <button type="button" className={styles.inlineInfoBtn} aria-label="Confidence explanation">
                        i
                      </button>
                      <span className={styles.inlineInfoBubble} role="tooltip">
                        Confidence reflects data completeness. More score, calorie, and nutrition data means more reliable insights.
                      </span>
                    </span>
                  </div>
                  <div className={styles.answerText}>
                    <strong>{confidenceSummary.level}</strong> ({confidenceSummary.overall}%)
                    {"\n"}
                    Score data {confidenceSummary.scoreCoverage}% • Calories {confidenceSummary.calorieCoverage}% •
                    Nutrition {confidenceSummary.nutrientCoverage}%
                  </div>
                </div>
              </div>
              <div className={styles.miniGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>
                    Goal hit-rate ({labelForTrendWindow(trendWindow)})
                    <span className={styles.inlineInfoWrap}>
                      <button type="button" className={styles.inlineInfoBtn} aria-label="Goal hit-rate explanation">
                        i
                      </button>
                      <span className={styles.inlineInfoBubble} role="tooltip">
                        Shows the percent of logged days where carbs, protein, fat, and sugar were within your target ranges.
                      </span>
                    </span>
                  </div>
                  <div className={styles.answerText}>
                    Overall: <strong>{goalHitRate.overall == null ? "—" : `${goalHitRate.overall}%`}</strong>
                    {"\n"}
                    Carbs: {goalHitRate.carbsPct == null ? "—" : `${goalHitRate.carbsPct}%`} ({goalHitRate.carbsSeen} days)
                    {"\n"}
                    Protein: {goalHitRate.proteinPct == null ? "—" : `${goalHitRate.proteinPct}%`} ({goalHitRate.proteinSeen} days)
                    {"\n"}
                    Fat: {goalHitRate.fatPct == null ? "—" : `${goalHitRate.fatPct}%`} ({goalHitRate.fatSeen} days)
                    {"\n"}
                    Sugar: {goalHitRate.sugarPct == null ? "—" : `${goalHitRate.sugarPct}%`} ({goalHitRate.sugarSeen} days)
                  </div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>
                    Consistency by day-of-week
                    <span className={styles.inlineInfoWrap}>
                      <button type="button" className={styles.inlineInfoBtn} aria-label="Day-of-week consistency explanation">
                        i
                      </button>
                      <span className={styles.inlineInfoBubble} role="tooltip">
                        Each column shows how consistently you logged on that weekday across the selected period.
                      </span>
                    </span>
                  </div>
                  <div className={styles.heatStrip}>
                    {dowConsistency.map((d) => (
                      <div key={d.name} className={styles.heatCol}>
                        <div className={styles.heatLabel}>{d.name}</div>
                        <div className={styles.heatTrack}>
                          <div
                            className={styles.heatFill}
                            style={{ height: `${Math.max(6, d.pct)}%`, opacity: 0.2 + d.pct / 125 }}
                          />
                        </div>
                        <div className={styles.heatPct}>{d.pct}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.insightBox}>
                <div className={styles.answerTitle}>
                  Quick compare
                  <span className={styles.inlineInfoWrap}>
                    <button type="button" className={styles.inlineInfoBtn} aria-label="Quick compare explanation">
                      i
                    </button>
                    <span className={styles.inlineInfoBubble} role="tooltip">
                      Compares this selected period against the previous period of the same length.
                    </span>
                  </span>
                </div>
                <div className={styles.answerText}>{trendCompareText}</div>
              </div>
              <div className={styles.miniGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Top 3 wins ({labelForTrendWindow(trendWindow)})</div>
                  <div className={styles.answerText}>
                    {winsAndDrags.wins.length
                      ? winsAndDrags.wins.map((w, i) => `${i + 1}. ${w}`).join("\n")
                      : "Not enough data yet"}
                  </div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Top 3 drags ({labelForTrendWindow(trendWindow)})</div>
                  <div className={styles.answerText}>
                    {winsAndDrags.drags.length
                      ? winsAndDrags.drags.map((d, i) => `${i + 1}. ${d}`).join("\n")
                      : "None flagged this period"}
                  </div>
                </div>
              </div>
              <div className={styles.miniCard}>
                <div className={styles.answerTitle}>Ask coach about this view</div>
                <div className={styles.field}>
                  <textarea
                    className={styles.textarea}
                    placeholder='Example: "Why is my sugar hit-rate low this month?"'
                    value={quickQuestion}
                    onChange={(e) => setQuickQuestion(e.target.value)}
                  />
                </div>
                <div className={styles.btnRow}>
                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={askCoachQuick}
                    disabled={asking || !quickQuestion.trim()}
                  >
                    {asking ? "Thinking…" : "Ask about these insights"}
                  </button>
                </div>
              </div>
              <div className={styles.btnRow}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={exportSummary}>
                  Export / Share summary
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Breakdown */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>Food Group Breakdown</div>
              <div className={styles.cardMeta}>Estimated from text + parsed meal items/tags</div>
            </div>
            <div className={styles.pills}>
              <span className={styles.pill}>2 days (default)</span>
              <label className={styles.rangeLabel} htmlFor="breakdownRange">
                Show
              </label>
              <select
                id="breakdownRange"
                className={styles.rangeSelect}
                value={breakdownDays}
                onChange={(e) => setBreakdownDays(Number(e.target.value))}
              >
                <option value={3}>3 days</option>
                <option value={4}>4 days</option>
                <option value={5}>5 days</option>
                <option value={6}>6 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
          </div>

          <div className={styles.breakdownLegend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendFruit}`} />
              <span>Fruit</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendVeg}`} />
              <span>Vegetables</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendGrains}`} />
              <span>Grains</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendSalt}`} />
              <span>Salt</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendSugar}`} />
              <span>Sugar</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendCalories}`} />
              <span>Calories</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendCarbs}`} />
              <span>Carbs</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendProtein}`} />
              <span>Protein</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendFat}`} />
              <span>Fat</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendSatFat}`} />
              <span>Sat fat</span>
            </span>
          </div>

          <div className={styles.breakdownList}>
            {breakdownRows.map((d) => {
              return (
                <div key={d.key} className={styles.breakdownRow}>
                  <div className={styles.breakdownDate}>
                    {d.key === todayKey ? `${d.key} (today)` : d.key}
                  </div>
                  <div className={styles.breakdownContent}>
                    <div className={styles.nutrientGrid}>
                      <span
                        className={`${styles.nutrientChip} ${styles.nutrientCalories}`}
                        style={chipFillStyle(progressPct(dailyTargets.calories, d.calories))}
                      >
                        Calories: {d.calories == null ? "—" : d.calories}
                      </span>
                      <span
                        className={`${styles.nutrientChip} ${styles.nutrientCarbs}`}
                        style={chipFillStyle(progressPct(dailyTargets.carbsG, d.carbsG))}
                      >
                        Carbs: {d.carbsG == null ? "—" : `${d.carbsG}g`}
                      </span>
                      <span
                        className={`${styles.nutrientChip} ${styles.nutrientProtein}`}
                        style={chipFillStyle(progressPct(dailyTargets.proteinG, d.proteinG))}
                      >
                        Protein: {d.proteinG == null ? "—" : `${d.proteinG}g`}
                      </span>
                      <span
                        className={`${styles.nutrientChip} ${styles.nutrientFat}`}
                        style={chipFillStyle(progressPct(dailyTargets.fatG, d.fatG))}
                      >
                        Fat: {d.fatG == null ? "—" : `${d.fatG}g`}
                      </span>
                    </div>
                    <div className={styles.dayDivider} />
                    <div className={styles.ratioGrid}>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioFruit}`}
                        style={chipFillStyle(progressPct(dailyTargets.fruitServings, round1(d.fruit)))}
                      >
                        Fruit (serv): {ratioLabel(dailyTargets.fruitServings, round1(d.fruit), "")}
                      </span>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioGrains}`}
                        style={chipFillStyle(progressPct(dailyTargets.grainsServings, round1(d.grains)))}
                      >
                        Grains (serv): {ratioLabel(dailyTargets.grainsServings, round1(d.grains), "")}
                      </span>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioVeg}`}
                        style={chipFillStyle(progressPct(dailyTargets.vegServings, round1(d.veg)))}
                      >
                        Vegetables (serv): {ratioLabel(dailyTargets.vegServings, round1(d.veg), "")}
                      </span>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioFat}`}
                        style={chipFillStyle(progressPct(dailyTargets.fatG, d.fatG))}
                      >
                        Fat (g): {ratioLabel(dailyTargets.fatG, d.fatG, "g")}
                      </span>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioSugar}`}
                        style={chipFillStyle(progressPct(dailyTargets.sugarG, d.sugarG))}
                      >
                        Sugar: {ratioLabel(dailyTargets.sugarG, d.sugarG, "g")}
                      </span>
                      <span
                        className={`${styles.ratioChip} ${styles.ratioSatFat}`}
                        style={chipFillStyle(progressPct(dailyTargets.satFatG, d.satFatG))}
                      >
                        Sat fat: {ratioLabel(dailyTargets.satFatG, d.satFatG, "g")}
                      </span>
                    </div>
                    {d.entries === 0 ? <div className={styles.breakdownEmpty}>No logged meals</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.note}>
            Daily totals include calories/carbs/protein/fat plus food-group mix from parsed items/tags.
            Targets shown inline are tuned to your active plan ({primaryPlan?.name ?? "Default plan"}).
          </div>

          <div className={styles.insightBox}>
            <div className={styles.answerTitle}>Food mix insight</div>
            <div className={styles.answerText}>{foodSummaryText}</div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.titleWithInfo}>
                <span className={styles.cardTitle}>Additional insights</span>
                <span className={styles.inlineInfoWrap}>
                  <button type="button" className={styles.inlineInfoBtn} aria-label="Additional insights explanation">
                    i
                  </button>
                  <span className={styles.inlineInfoBubble} role="tooltip">
                    Extra behavior-level patterns that help explain why your results are moving the way they are.
                  </span>
                </span>
              </div>
              <div className={styles.cardMeta}>Behavior patterns inferred from your recent logs</div>
            </div>
          </div>
          <button
            type="button"
            className={styles.moreToggle}
            aria-expanded={showAdditionalMore}
            onClick={() => setShowAdditionalMore((v) => !v)}
          >
            <span className={styles.moreTriangle}>{showAdditionalMore ? "▲" : "▼"}</span> More
          </button>
          {showAdditionalMore && (
            <div className={styles.moreWrap}>
              <div className={styles.miniGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Habit loop</div>
                  <div className={styles.answerText}>{habitLoopSummary}</div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Adherence momentum</div>
                  <div className={styles.answerText}>{momentumSummary}</div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Weekend vs weekday</div>
                  <div className={styles.answerText}>{weekendWeekdaySummary}</div>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.answerTitle}>Late-night eating</div>
                  <div className={styles.answerText}>{lateNightImpactSummary}</div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Q&A */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>Ask Coach</div>
              <div className={styles.cardMeta}>Questions are answered from your last 30 days of history</div>
            </div>
          </div>

          {answer && (
            <div className={styles.insightBox}>
              <div className={styles.answerTitle}>Coach response</div>
              <div className={styles.answerText}>{answer}</div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="coachQuestion">
              Ask about your patterns or how to get back on track
            </label>
            <textarea
              id="coachQuestion"
              className={styles.textarea}
              placeholder='Example: "Why was my score low this week?" or "What are 3 swaps based on what I actually eat?"'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={askCoach}
              disabled={asking || !question.trim()}
            >
              {asking ? "Thinking…" : "Ask"}
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => {
                setQuestion("");
                setAnswer(null);
              }}
              disabled={asking}
            >
              Clear
            </button>
          </div>
        </section>
      </div>

      {loading && <div className={styles.loading}>Loading…</div>}
    </main>
  );
}
