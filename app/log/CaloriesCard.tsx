"use client";

import styles from "./log.module.css";
import type { CSSProperties } from "react";

type Me = {
  username: string;
  dailyCalorieGoal: number | null;
};

type MacroTotals = {
  carbsG?: number | null;
  fatG?: number | null;
  proteinG?: number | null;
};

type FoodItem = {
  text: string;
  calories?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  proteinG?: number | null;
};

type Props = {
  me: Me | null;
  todayCals: number;
  goal: number | null;
  planName: string | null;

  // diet compliance for TODAY (0..100 or null)
  dietTodayScore: number | null;

  // list of foods eaten today with optional per-entry macros
  todayFoods: FoodItem[];

  // NEW: macros (grams) for the day (optional; safe until we capture nutrition)
  macros?: MacroTotals | null;
};

/* ---------- helpers ---------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct01FromCalories(todayCals: number, goal: number | null) {
  if (!goal || goal <= 0) return 0;
  return clamp(todayCals / goal, 0, 1);
}

function pct01FromScore(score: number | null) {
  if (score == null) return 0;
  return clamp(score / 100, 0, 1);
}

function gaugeStrokeDash(p: number) {
  const total = 100;
  const filled = Math.round(clamp(p, 0, 1) * total);
  return `${filled} ${total - filled}`;
}

// Calories gauge colors: <80% GOOD (Taverai teal), 80-90% WARN, 90-100% BAD
function calorieGaugeColors(pct: number) {
  if (pct < 0.8) {
    return {
      fill: "var(--good)",
      track: "rgba(118,199,192,0.15)",
      needle: "var(--good)",
    };
  }
  if (pct < 0.9) {
    return {
      fill: "var(--warn)",
      track: "rgba(250,204,21,0.15)",
      needle: "var(--warn)",
    };
  }
  return {
    fill: "var(--bad)",
    track: "rgba(239,68,68,0.15)",
    needle: "var(--bad)",
  };
}

// Diet compliance colors: >=80 GOOD (Taverai teal), 65-79 WARN, <65 BAD
function complianceGaugeColors(score: number) {
  if (score >= 80) {
    return {
      fill: "var(--good)",
      track: "rgba(118,199,192,0.15)",
      needle: "var(--good)",
    };
  }
  if (score >= 65) {
    return {
      fill: "var(--warn)",
      track: "rgba(250,204,21,0.15)",
      needle: "var(--warn)",
    };
  }
  return {
    fill: "var(--bad)",
    track: "rgba(239,68,68,0.15)",
    needle: "var(--bad)",
  };
}

/* ---------- macros bar helpers ---------- */

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function macroPercents(t: MacroTotals | null | undefined) {
  if (!t) return null;

  const carbsG = Number(t.carbsG ?? 0);
  const fatG = Number(t.fatG ?? 0);
  const proteinG = Number(t.proteinG ?? 0);

  const carbCals = carbsG * 4;
  const fatCals = fatG * 9;
  const proteinCals = proteinG * 4;

  const total = carbCals + fatCals + proteinCals;
  if (!total || !Number.isFinite(total)) return null;

  const carbs = clampPct(carbCals / total);
  const fat = clampPct(fatCals / total);
  const protein = clampPct(proteinCals / total);

  return { carbs, fat, protein };
}

function MacroBar({ totals }: { totals: MacroTotals | null | undefined }) {
  const pct = macroPercents(totals);

  if (!pct) {
    return (
      <div className={styles.macroWrap}>
        <div className={styles.macroHeader}>
          <div className={styles.macroTitle}>Macro balance</div>
          <div className={styles.macroHint}>Coming soon (barcode/photo)</div>
        </div>

        <div className={styles.macroEmpty}>
          Macros aren’t available yet — once we detect nutrition, you’ll see carb/fat/protein balance here.
        </div>
      </div>
    );
  }

  const carbsPct = Math.round(pct.carbs * 100);
  const fatPct = Math.round(pct.fat * 100);
  const proteinPct = Math.max(0, 100 - carbsPct - fatPct); // keep it clean to 100

  return (
    <div className={styles.macroWrap}>
      <div className={styles.macroHeader}>
        <div className={styles.macroTitle}>Macro balance</div>
        <div className={styles.macroHint}>
          Mediterranean target: 45–65 C • 20–35 F • 10–35 P
        </div>
      </div>

      <div className={styles.macroBar} aria-label="Macro balance bar">
        <div className={styles.macroSegCarb} style={{ width: `${carbsPct}%` }} />
        <div className={styles.macroSegFat} style={{ width: `${fatPct}%` }} />
        <div className={styles.macroSegProtein} style={{ width: `${proteinPct}%` }} />
      </div>

      <div className={styles.macroMeta}>
        <div>
          <span className={styles.macroDotCarb} /> Carbs <strong>{carbsPct}%</strong>
        </div>
        <div>
          <span className={styles.macroDotFat} /> Fat <strong>{fatPct}%</strong>
        </div>
        <div>
          <span className={styles.macroDotProtein} /> Protein{" "}
          <strong>{proteinPct}%</strong>
        </div>
      </div>
    </div>
  );
}

function formatGramValue(v: number | null | undefined) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* ---------- compliance-style half gauge ---------- */

function HalfGauge({
  pct,
  track,
  fill,
  needle,
}: {
  pct: number; // 0..1
  track: string;
  fill: string;
  needle: string;
}) {
  const p = clamp(pct, 0, 1);

  // top-half sweep: -90 (left) → 0 (up) → +90 (right)
  const angle = -90 + p * 180;

  const styleVars: CSSProperties = {
    ["--gauge-track" as any]: track,
    ["--gauge-fill" as any]: fill,
  };

  return (
    <div className={styles.compGaugeWrap} style={styleVars}>
      <svg className={styles.compGauge} viewBox="0 0 200 120" aria-hidden="true">
        {/* track arc */}
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="16"
          className={styles.compTrack}
        />

        {/* fill arc */}
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="16"
          className={styles.compFill}
          pathLength={100}
          strokeDasharray={gaugeStrokeDash(p)}
        />

        {/* needle */}
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="32"
          transform={`rotate(${angle} 100 100)`}
          stroke={needle}
          strokeWidth={2.8}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* hub */}
        <circle cx="100" cy="100" r="3.2" fill={needle} opacity={0.9} />
      </svg>
    </div>
  );
}

/* ---------- component ---------- */

export default function CaloriesCard({
  me,
  todayCals,
  goal,
  planName,
  dietTodayScore,
  todayFoods,
  macros,
}: Props) {
  const caloriePct = pct01FromCalories(todayCals, goal);
  const calColors = calorieGaugeColors(caloriePct);

  const dietScore =
    typeof dietTodayScore === "number" && Number.isFinite(dietTodayScore)
      ? clamp(dietTodayScore, 0, 100)
      : null;

  const dietPct = pct01FromScore(dietScore);
  const dietColors =
    dietScore == null
      ? { fill: "#9ca3af", track: "#f3f4f6", needle: "#6b7280" }
      : complianceGaugeColors(dietScore);

  return (
    <section className={styles.card}>
      <div className={styles.h2Row}>
        <h2 className={styles.h2}>Calories</h2>
        <span className={styles.small}>{planName ?? "No plan selected"}</span>
      </div>

      <div className={styles.calorieUser}>
        <strong>User:</strong> {me?.username ?? "—"}
      </div>

      <div className={styles.gaugeRow}>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div className={styles.compGaugeLabelRow}>
            <div className={styles.compGaugeLabel}>Calories today</div>
            <div className={styles.compGaugeValue}>
              {goal ? `${todayCals}/${goal} kcal` : `${todayCals} kcal`}
            </div>
          </div>

          <HalfGauge
            pct={caloriePct}
            track={calColors.track}
            fill={calColors.fill}
            needle={calColors.needle}
          />
        </div>

        <div style={{ width: "100%", maxWidth: 320 }}>
          <div className={styles.compGaugeLabelRow}>
            <div className={styles.compGaugeLabel}>Diet today</div>
            <div className={styles.compGaugeValue}>
              {dietScore == null ? "—" : `${dietScore}/100`}
            </div>
          </div>

          <HalfGauge
            pct={dietPct}
            track={dietColors.track}
            fill={dietColors.fill}
            needle={dietColors.needle}
          />
        </div>
      </div>

      {/* ✅ NEW: Macro balance bar (below gauges, above foods) */}
      <MacroBar totals={macros ?? null} />

      {/* foods eaten today, styled like textarea */}
      <div style={{ marginTop: 12 }}>
        <div className={styles.compSectionTitle}>Food eaten today</div>

        <div className={styles.foodListBox} aria-label="Food eaten today">
          {todayFoods.length === 0 ? (
            <div className={styles.foodListEmpty}>No entries yet today.</div>
          ) : (
            todayFoods.map((t, i) => (
              <div key={i} className={styles.foodListItem}>
                <div>{t.text}</div>
                <div>
                  {formatGramValue(t.calories)} kcal • P {formatGramValue(t.proteinG)}g • C{" "}
                  {formatGramValue(t.carbsG)}g • F {formatGramValue(t.fatG)}g
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.calorieMeta}>
        <div>
          <strong>Status:</strong>{" "}
          {goal ? (todayCals <= goal ? "On track" : "Over goal") : "No goal set"}
        </div>
      </div>
    </section>
  );
}
