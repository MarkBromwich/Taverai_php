"use client";

import styles from "./log.module.css";
import type { CSSProperties } from "react";

type Me = {
  username: string;
  dailyCalorieGoal: number | null;
};

type Macros = {
  carbsG: number;
  fatG: number;
  proteinG: number;
} | null;

type Props = {
  me: Me | null;
  todayCals: number;
  goal: number | null;
  planName: string | null;

  // diet compliance for TODAY (0..100 or null)
  dietTodayScore: number | null;

  // list of foods eaten today (plain entry text)
  todayFoods: string[];

  // NEW: day totals for macros (grams), or null if unknown
  macros?: Macros;
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

// Calories gauge colors: <80% GOOD, 80-90% WARN, 90-100% BAD
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

// Diet compliance colors: >=80 GOOD, 65-79 WARN, <65 BAD
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

/* ---------- macro bar helpers ---------- */

function macroKcalFromGrams(macros: { carbsG: number; fatG: number; proteinG: number }) {
  // 4/9/4 kcal per gram
  const carbsKcal = Math.max(0, macros.carbsG) * 4;
  const fatKcal = Math.max(0, macros.fatG) * 9;
  const proteinKcal = Math.max(0, macros.proteinG) * 4;
  const total = carbsKcal + fatKcal + proteinKcal;
  return { carbsKcal, fatKcal, proteinKcal, total };
}

function pct3(x: number, total: number) {
  if (!total || total <= 0) return 0;
  return clamp(x / total, 0, 1);
}

/* ---------- component ---------- */

export default function CaloriesCard({
  me,
  todayCals,
  goal,
  planName,
  dietTodayScore,
  todayFoods,
  macros = null,
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

  // macro bar numbers (kcal-based percent so it reflects energy share)
  const macroBar = macros ? macroKcalFromGrams(macros) : null;

  const carbsPct = macroBar ? pct3(macroBar.carbsKcal, macroBar.total) : 0;
  const fatPct = macroBar ? pct3(macroBar.fatKcal, macroBar.total) : 0;
  const proteinPct = macroBar ? pct3(macroBar.proteinKcal, macroBar.total) : 0;

  // Balanced (Mediterranean-ish) ranges you described:
  // Carbs 45–65, Fat 20–35, Protein 10–35
  const ranges = {
    carbs: { min: 45, max: 65 },
    fat: { min: 20, max: 35 },
    protein: { min: 10, max: 35 },
  };

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

      {/* ✅ NEW: Macros bar (below gauges, above foods) */}
      <div style={{ marginTop: 14 }}>
        <div className={styles.compGaugeLabelRow}>
          <div className={styles.compGaugeLabel}>Macros today</div>
          <div className={styles.compGaugeValue}>
            {macroBar && macroBar.total > 0 ? "Share of calories" : "—"}
          </div>
        </div>

        {macroBar && macroBar.total > 0 ? (
          <>
            <div className={styles.macroBar} aria-label="Macros bar">
              <div
                className={styles.macroCarb}
                style={{ width: `${Math.round(carbsPct * 1000) / 10}%` }}
                aria-label="Carbs"
              />
              <div
                className={styles.macroFat}
                style={{ width: `${Math.round(fatPct * 1000) / 10}%` }}
                aria-label="Fat"
              />
              <div
                className={styles.macroProtein}
                style={{ width: `${Math.round(proteinPct * 1000) / 10}%` }}
                aria-label="Protein"
              />
            </div>

            <div className={styles.macroLegend}>
              <div className={styles.macroItem}>
                <span className={`${styles.macroDot} ${styles.macroCarbDot}`} />
                <div>
                  <div className={styles.macroLabel}>Carbs</div>
                  <div className={styles.macroMeta}>
                    {Math.round(carbsPct * 100)}% • target {ranges.carbs.min}–{ranges.carbs.max}%
                  </div>
                </div>
              </div>

              <div className={styles.macroItem}>
                <span className={`${styles.macroDot} ${styles.macroFatDot}`} />
                <div>
                  <div className={styles.macroLabel}>Fat</div>
                  <div className={styles.macroMeta}>
                    {Math.round(fatPct * 100)}% • target {ranges.fat.min}–{ranges.fat.max}%
                  </div>
                </div>
              </div>

              <div className={styles.macroItem}>
                <span className={`${styles.macroDot} ${styles.macroProteinDot}`} />
                <div>
                  <div className={styles.macroLabel}>Protein</div>
                  <div className={styles.macroMeta}>
                    {Math.round(proteinPct * 100)}% • target {ranges.protein.min}–{ranges.protein.max}%
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.muted} style={{ marginTop: 8 }}>
            Macros will appear once entries include nutrition details.
          </div>
        )}
      </div>

      {/* foods eaten today */}
      <div style={{ marginTop: 12 }}>
        <div className={styles.compSectionTitle}>Food eaten today</div>

        <div className={styles.foodListBox} aria-label="Food eaten today">
          {todayFoods.length === 0 ? (
            <div className={styles.foodListEmpty}>No entries yet today.</div>
          ) : (
            todayFoods.map((t, i) => (
              <div key={i} className={styles.foodListItem}>
                {t}
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