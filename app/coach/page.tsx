"use client";

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
  parsed?: { estimatedCalories?: number; items?: any[]; dietTags?: string[] };
  scores?: ScoreRow[];
};

type Me = { username: string; dailyCalorieGoal: number | null };

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

function avg(nums: number[]) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function entryCalories(parsed: any) {
  const c = parsed?.estimatedCalories;
  return typeof c === "number" && Number.isFinite(c) ? c : 0;
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

/** Very simple bucket heuristics (MVP).
 * Later you can replace with USDA macros.
 */
function bucketCountsFromText(text: string) {
  const t = (text || "").toLowerCase();

  const fruit = [
    "apple",
    "banana",
    "berries",
    "berry",
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
  ];
  const veg = [
    "salad",
    "spinach",
    "broccoli",
    "carrot",
    "carrots",
    "pepper",
    "peppers",
    "tomato",
    "tomatoes",
    "cucumber",
    "lettuce",
    "onion",
    "onions",
    "zucchini",
    "asparagus",
    "kale",
    "cauliflower",
    "greens",
    "vegetable",
    "veggies",
  ];
  const carbs = [
    "bread",
    "toast",
    "rice",
    "pasta",
    "noodle",
    "noodles",
    "tortilla",
    "wrap",
    "potato",
    "potatoes",
    "fries",
    "chips",
    "cracker",
    "crackers",
    "cereal",
    "oats",
    "oatmeal",
    "granola",
    "cookie",
    "cookies",
    "cake",
    "sugar",
    "soda",
  ];
  const fats = [
    "olive oil",
    "oil",
    "avocado",
    "nuts",
    "almond",
    "walnut",
    "peanut",
    "butter",
    "cheese",
    "feta",
    "mayonnaise",
    "mayo",
    "cream",
    "bacon",
  ];

  const countMatches = (arr: string[]) => {
    let c = 0;
    for (const k of arr) if (t.includes(k)) c++;
    return c;
  };

  return {
    fruit: countMatches(fruit),
    veg: countMatches(veg),
    carbs: countMatches(carbs),
    fats: countMatches(fats),
  };
}

function Sparkline({
  values,
  min,
  max,
}: {
  values: Array<number | null>;
  min: number;
  max: number;
}) {
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
        y == null ? null : <circle key={i} cx={pts.xs[i]} cy={y} r="3.2" className={styles.dot} />
      )}
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
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

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

  const last7Keys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 6; i >= 0; i--) keys.push(dateKeyLocal(addDays(today, -i)));
    return keys;
  }, [today]);

  const last30Keys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 29; i >= 0; i--) keys.push(dateKeyLocal(addDays(today, -i)));
    return keys;
  }, [today]);

  const series7 = useMemo(() => {
    const scoreVals: Array<number | null> = [];
    const calVals: Array<number | null> = [];

    for (const k of last7Keys) {
      const list = byDay.get(k) ?? [];
      const scores: number[] = [];
      let cals = 0;

      for (const e of list) {
        const s = scoreForEntry(e, planId);
        if (typeof s === "number") scores.push(s);
        cals += entryCalories(e.parsed);
      }

      scoreVals.push(avg(scores));
      calVals.push(list.length ? Math.round(cals) : null);
    }

    return { scoreVals, calVals };
  }, [byDay, last7Keys, planId]);

  const breakdown7 = useMemo(() => {
    return last7Keys.map((k) => {
      const list = byDay.get(k) ?? [];
      const totals = { fruit: 0, veg: 0, carbs: 0, fats: 0 };

      for (const e of list) {
        const b = bucketCountsFromText(e.text);
        totals.fruit += b.fruit;
        totals.veg += b.veg;
        totals.carbs += b.carbs;
        totals.fats += b.fats;
      }

      const sum = totals.fruit + totals.veg + totals.carbs + totals.fats;
      return { key: k, ...totals, sum };
    });
  }, [byDay, last7Keys]);

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
              <div className={styles.cardTitle}>Weekly trend</div>
              <div className={styles.cardMeta}>Last 7 days ({last7Keys[0]} → {last7Keys[last7Keys.length - 1]})</div>
            </div>
            <div className={styles.pills}>
              <span className={styles.pill}>Score</span>
              <span className={styles.pillGhost}>Calories</span>
            </div>
          </div>

          <div className={styles.chartGrid}>
            <div className={styles.chartBlock}>
              <div className={styles.chartLabelRow}>
                <span className={styles.chartLabel}>Score</span>
                <span className={styles.chartValue}>
                  {avg(series7.scoreVals.filter((x): x is number => typeof x === "number")) ?? "—"}/100
                </span>
              </div>
              <Sparkline values={series7.scoreVals} min={0} max={100} />
              <div className={styles.xLabels}>
                {last7Keys.map((k) => (
                  <span key={k}>{k.slice(5)}</span>
                ))}
              </div>
            </div>

            <div className={styles.chartBlock}>
              <div className={styles.chartLabelRow}>
                <span className={styles.chartLabel}>Calories</span>
                <span className={styles.chartValue}>
                  {me?.dailyCalorieGoal ? `Goal ${me.dailyCalorieGoal}` : "No goal"}
                </span>
              </div>
              <Sparkline
                values={series7.calVals}
                min={0}
                max={Math.max(
                  500,
                  ...(series7.calVals.filter((x): x is number => typeof x === "number") as number[]),
                  me?.dailyCalorieGoal ?? 0
                )}
              />
              <div className={styles.xLabels}>
                {last7Keys.map((k) => (
                  <span key={k}>{k.slice(5)}</span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.note}>
            Tip: Click into <a href="/log">Log</a> to add entries — the Coach page updates automatically.
          </div>
        </section>

        {/* Breakdown */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>Food-group breakdown</div>
              <div className={styles.cardMeta}>Simple keyword-based estimate (MVP)</div>
            </div>
            <div className={styles.pills}>
              <span className={styles.pill}>7 days</span>
            </div>
          </div>

          <div className={styles.breakdownLegend}>
            <span className={`${styles.legendDot} ${styles.legendFruit}`} /> Fruit
            <span className={`${styles.legendDot} ${styles.legendVeg}`} /> Veg
            <span className={`${styles.legendDot} ${styles.legendCarbs}`} /> Carbs
            <span className={`${styles.legendDot} ${styles.legendFats}`} /> Fats
          </div>

          <div className={styles.breakdownList}>
            {breakdown7.map((d) => {
              const denom = d.sum || 1;
              const fruitP = Math.round((d.fruit / denom) * 100);
              const vegP = Math.round((d.veg / denom) * 100);
              const carbsP = Math.round((d.carbs / denom) * 100);
              const fatsP = Math.max(0, 100 - fruitP - vegP - carbsP);

              return (
                <div key={d.key} className={styles.breakdownRow}>
                  <div className={styles.breakdownDate}>
                    {d.key === todayKey ? `${d.key} (today)` : d.key}
                  </div>

                  <div className={styles.stack}>
                    <div className={`${styles.seg} ${styles.segFruit}`} style={{ width: `${fruitP}%` }} />
                    <div className={`${styles.seg} ${styles.segVeg}`} style={{ width: `${vegP}%` }} />
                    <div className={`${styles.seg} ${styles.segCarbs}`} style={{ width: `${carbsP}%` }} />
                    <div className={`${styles.seg} ${styles.segFats}`} style={{ width: `${fatsP}%` }} />
                  </div>

                  <div className={styles.breakdownNums}>{d.sum === 0 ? "—" : `F${d.fruit} V${d.veg} C${d.carbs} Fa${d.fats}`}</div>
                </div>
              );
            })}
          </div>

          <div className={styles.note}>
            Next upgrade: replace this with USDA-derived grams (carbs/fat/fiber) once your parsed items include nutrients.
          </div>
        </section>

        {/* Q&A */}
        <section className={styles.card}>
          {/* ✅ Put answer FIRST so users see it immediately */}
          {answer && (
            <div className={styles.answerBox}>
              <div className={styles.answerTitle}>Coach response</div>
              <div className={styles.answerText}>{answer}</div>
            </div>
          )}

          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>Ask Coach</div>
              <div className={styles.cardMeta}>Questions are answered from your last 30 days of history</div>
            </div>
          </div>

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
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={askCoach} disabled={asking || !question.trim()}>
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