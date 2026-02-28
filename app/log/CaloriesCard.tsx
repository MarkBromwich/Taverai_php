"use client";

import styles from "./log.module.css";
import { useState } from "react";
import type { CSSProperties } from "react";
import { getDietScoringProfileBySlug } from "@/lib/dietScoringProfiles";

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
  id: string;
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
  planType: string | null;
  planTemplateSlug: string | null;

  // diet compliance for TODAY (0..100 or null)
  dietTodayScore: number | null;

  // list of foods eaten today with optional per-entry macros
  todayFoods: FoodItem[];
  onUpdateFood: (payload: {
    id: string;
    text: string;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  }) => Promise<void>;
  onDeleteFood: (id: string) => Promise<void>;

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

// Diet compliance colors tuned by selected plan type.
function complianceGaugeColors(
  score: number,
  planType: string | null,
  planTemplateSlug: string | null
) {
  const type = (planType ?? "").toUpperCase();

  // Calorie plans should be stricter around target adherence.
  if (type === "CALORIE") {
    if (score >= 90) {
      return {
        fill: "var(--good)",
        track: "rgba(118,199,192,0.15)",
        needle: "var(--good)",
      };
    }
    if (score >= 75) {
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

  const profile = getDietScoringProfileBySlug(planTemplateSlug);
  const strictness = profile.penaltyDivisor;

  let goodMin = 80;
  let warnMin = 65;
  if (strictness <= 0.25) {
    goodMin = 88;
    warnMin = 72;
  } else if (strictness <= 0.28) {
    goodMin = 84;
    warnMin = 68;
  }

  if (score >= goodMin) {
    return {
      fill: "var(--good)",
      track: "rgba(118,199,192,0.15)",
      needle: "var(--good)",
    };
  }
  if (score >= warnMin) {
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

function macroStatus(pct: number, min: number, max: number) {
  if (pct < min) return "low";
  if (pct > max) return "high";
  return "green";
}

function macroCoachSummary(
  carbsPct: number,
  fatPct: number,
  proteinPct: number,
  ranges: {
    carbs: { min: number; max: number };
    fat: { min: number; max: number };
    protein: { min: number; max: number };
  }
) {
  const c = macroStatus(carbsPct, ranges.carbs.min, ranges.carbs.max);
  const f = macroStatus(fatPct, ranges.fat.min, ranges.fat.max);
  const p = macroStatus(proteinPct, ranges.protein.min, ranges.protein.max);

  if (c === "green" && f === "green" && p === "green") {
    return "Coach: Carbs, fat, and protein are all in the green range today. Keep this balance.";
  }

  return `Coach: Carbs are ${c}, fat is ${f}, and protein is ${p}. Aim for 45-65% carbs, 20-35% fat, and 10-35% protein.`;
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
  const ranges = {
    carbs: { min: 45, max: 65 },
    fat: { min: 20, max: 35 },
    protein: { min: 10, max: 35 },
  };

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
          <div>Target {ranges.carbs.min}–{ranges.carbs.max}%</div>
        </div>
        <div>
          <span className={styles.macroDotFat} /> Fat <strong>{fatPct}%</strong>
          <div>Target {ranges.fat.min}–{ranges.fat.max}%</div>
        </div>
        <div>
          <span className={styles.macroDotProtein} /> Protein{" "}
          <strong>{proteinPct}%</strong>
          <div>Target {ranges.protein.min}–{ranges.protein.max}%</div>
        </div>
      </div>

      <div className={styles.macroCoach}>
        {macroCoachSummary(carbsPct, fatPct, proteinPct, ranges)}
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
  planType,
  planTemplateSlug,
  dietTodayScore,
  todayFoods,
  macros,
  onUpdateFood,
  onDeleteFood,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftCalories, setDraftCalories] = useState("");
  const [draftProtein, setDraftProtein] = useState("");
  const [draftCarbs, setDraftCarbs] = useState("");
  const [draftFat, setDraftFat] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      : complianceGaugeColors(dietScore, planType, planTemplateSlug);

  function startEdit(item: FoodItem) {
    setEditingId(item.id);
    setDraftText(item.text);
    setDraftCalories(item.calories == null ? "" : String(item.calories));
    setDraftProtein(item.proteinG == null ? "" : String(item.proteinG));
    setDraftCarbs(item.carbsG == null ? "" : String(item.carbsG));
    setDraftFat(item.fatG == null ? "" : String(item.fatG));
  }

  function stopEdit() {
    setEditingId(null);
    setDraftText("");
    setDraftCalories("");
    setDraftProtein("");
    setDraftCarbs("");
    setDraftFat("");
  }

  function parseNum(v: string) {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function saveEdit() {
    if (!editingId) return;
    const text = draftText.trim();
    if (!text) return;
    setSavingId(editingId);
    try {
      await onUpdateFood({
        id: editingId,
        text,
        calories: parseNum(draftCalories),
        proteinG: parseNum(draftProtein),
        carbsG: parseNum(draftCarbs),
        fatG: parseNum(draftFat),
      });
      stopEdit();
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(id: string) {
    setDeletingId(id);
    try {
      await onDeleteFood(id);
      if (editingId === id) stopEdit();
    } finally {
      setDeletingId(null);
    }
  }

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
            todayFoods.map((t) => (
              <div key={t.id} className={styles.foodListItem}>
                <div className={styles.foodItemTop}>
                  <div>
                    <div>{t.text}</div>
                    <div>
                      {formatGramValue(t.calories)} kcal • P {formatGramValue(t.proteinG)}g • C{" "}
                      {formatGramValue(t.carbsG)}g • F {formatGramValue(t.fatG)}g
                    </div>
                  </div>
                  <div className={styles.foodItemActions}>
                    <button
                      type="button"
                      className={styles.foodItemActionBtn}
                      onClick={() => startEdit(t)}
                      disabled={deletingId === t.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.foodItemActionBtn}
                      onClick={() => void deleteItem(t.id)}
                      disabled={deletingId === t.id}
                    >
                      {deletingId === t.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>

                {editingId === t.id && (
                  <div className={styles.foodEditGrid}>
                    <input
                      className={styles.input}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder="Food name"
                    />
                    <input
                      className={styles.input}
                      value={draftCalories}
                      onChange={(e) => setDraftCalories(e.target.value)}
                      placeholder="Calories"
                      inputMode="decimal"
                    />
                    <input
                      className={styles.input}
                      value={draftProtein}
                      onChange={(e) => setDraftProtein(e.target.value)}
                      placeholder="Protein (g)"
                      inputMode="decimal"
                    />
                    <input
                      className={styles.input}
                      value={draftCarbs}
                      onChange={(e) => setDraftCarbs(e.target.value)}
                      placeholder="Carbs (g)"
                      inputMode="decimal"
                    />
                    <input
                      className={styles.input}
                      value={draftFat}
                      onChange={(e) => setDraftFat(e.target.value)}
                      placeholder="Fat (g)"
                      inputMode="decimal"
                    />
                    <div className={styles.foodEditActions}>
                      <button
                        type="button"
                        className={styles.foodItemActionBtn}
                        onClick={() => void saveEdit()}
                        disabled={savingId === t.id || !draftText.trim()}
                      >
                        {savingId === t.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={styles.foodItemActionBtn}
                        onClick={stopEdit}
                        disabled={savingId === t.id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
