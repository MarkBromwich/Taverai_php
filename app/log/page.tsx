"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./log.module.css";

import CaloriesCard from "./CaloriesCard";
import AddFoodCard from "./AddFoodCard";

export type Entry = {
  id: string;
  text: string;
  createdAt: string;
  parsed?: any;

  // Current DB FIELDS
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;

  scores?: Array<{
    score: number;
    plan: { id: string; name: string; type: string };
  }>;
};

type EntryForStreak = {
  createdAt: string;
};

type MeUser = {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  dailyCalorieGoal?: number | null;
};

type Plan = { id: string; name: string; type: string; config?: any };

/* ------------------------------
   Date Helpers
--------------------------------*/

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromYMD(ymd: string) {
  const [y, m, day] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

function addDays(ymd: string, delta: number) {
  const d = fromYMD(ymd);
  d.setDate(d.getDate() + delta);
  return toYMD(d);
}

function friendlyDateLabel(ymd: string) {
  const d = fromYMD(ymd);
  const today = toYMD(new Date());
  const yesterday = addDays(today, -1);

  if (ymd === today) return "Today";
  if (ymd === yesterday) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------
   Encouragement Builder
--------------------------------*/

function buildEncouragement(firstName: string, entriesCount: number) {
  const name = firstName || "there";

  if (entriesCount === 0) {
    return {
      title: `Hey ${name} 👋`,
      line: "Log your first meal and I’ll start scoring your day.",
    };
  }

  return {
    title: `Nice work, ${name} 💪`,
    line: "Small improvements compound. Keep going.",
  };
}

function toNumOrEmpty(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function computeLoggingStreak(entries: EntryForStreak[]) {
  if (!entries.length) return 0;

  const dayKeys = new Set(
    entries
      .map((e) => {
        const d = new Date(e.createdAt);
        return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
      })
      .filter((k): k is string => Boolean(k))
  );

  let streak = 0;
  let cursor = toYMD(new Date());

  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/* ------------------------------
   Page
--------------------------------*/

export default function LogPage() {
  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [ymd, setYmd] = useState(todayYMD);

  const [me, setMe] = useState<MeUser | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [planType, setPlanType] = useState<string | null>(null);
  const [planTemplateSlug, setPlanTemplateSlug] = useState<string | null>(null);

  // prevent paging into the future
  const todayKey = todayYMD;
  const canGoNext = ymd < todayKey;

  // Define which add method is visible
  const [addMode, setAddMode] = useState<"quick" | "manual">("quick");

  /* ---- helpers ---- */

  async function refreshEntriesForDay(dayKey: string) {
    const refreshed = await fetch(`/api/entries?date=${encodeURIComponent(dayKey)}`, {
      cache: "no-store",
    });
    const jj = await refreshed.json().catch(() => ({}));
    setEntries(Array.isArray(jj?.entries) ? jj.entries : []);
  }

  async function refreshStreak() {
    const res = await fetch("/api/entries", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    const allEntries = Array.isArray(j?.entries) ? (j.entries as EntryForStreak[]) : [];
    setStreakDays(computeLoggingStreak(allEntries));
  }

  /* ---- Load user ---- */
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!cancelled) setMe(j?.user ?? null);
      } catch {
        if (!cancelled) setMe(null);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Load plan ---- */
  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));

        const primary: Plan | null =
          j?.primaryPlan ?? j?.plan ?? (Array.isArray(j?.plans) ? j.plans[0] : null);

        if (!cancelled) {
          setPlanId(primary?.id ?? null);
          setPlanName(primary?.name ?? null);
          setPlanType(primary?.type ?? null);
          setPlanTemplateSlug(
            typeof primary?.config?.templateSlug === "string"
              ? primary.config.templateSlug
              : null
          );
        }
      } catch {
        if (!cancelled) {
          setPlanId(null);
          setPlanName(null);
          setPlanType(null);
          setPlanTemplateSlug(null);
        }
      }
    }

    loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Load entries (for selected day only) ---- */
  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      try {
        const res = await fetch(`/api/entries?date=${encodeURIComponent(ymd)}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));

        if (!cancelled) {
          setEntries(Array.isArray(j?.entries) ? j.entries : []);
        }
      } catch {
        if (!cancelled) setEntries([]);
      }
    }

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, [ymd]);

  /* ---- Load streak ---- */
  useEffect(() => {
    let cancelled = false;

    async function loadStreak() {
      try {
        const res = await fetch("/api/entries", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const allEntries = Array.isArray(j?.entries) ? (j.entries as EntryForStreak[]) : [];
        if (!cancelled) setStreakDays(computeLoggingStreak(allEntries));
      } catch {
        if (!cancelled) setStreakDays(0);
      }
    }

    loadStreak();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Summary ---- */
  const firstName = (me?.firstName ?? "").trim() || me?.username?.split("@")[0] || "";

  const encouragement = useMemo(() => {
    return buildEncouragement(firstName, entries.length);
  }, [firstName, entries.length]);

  const todayFoods = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        text: e.text,
        calories:
          e.calories ??
          e.parsed?.calories ??
          e.parsed?.kcal ??
          e.parsed?.nutrition?.calories ??
          null,
        proteinG:
          e.proteinG ??
          e.parsed?.macros?.proteinG ??
          e.parsed?.proteinG ??
          null,
        carbsG:
          e.carbsG ??
          e.parsed?.macros?.carbsG ??
          e.parsed?.carbsG ??
          null,
        fatG:
          e.fatG ??
          e.parsed?.macros?.fatG ??
          e.parsed?.fatG ??
          null,
      })),
    [entries]
  );

  async function updateFoodEntry(payload: {
    id: string;
    text: string;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  }) {
    const res = await fetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "Failed to update entry");
    }

    await refreshEntriesForDay(ymd);
    await refreshStreak();
  }

  async function deleteFoodEntry(id: string) {
    const res = await fetch("/api/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "Failed to delete entry");
    }

    await refreshEntriesForDay(ymd);
    await refreshStreak();
  }

  /**
   * REAL DATA PATH totals:
   * Use DB columns first; fallback to parsed for older rows.
   */
  const todayCals = useMemo(() => {
    return entries.reduce((sum, e) => {
      const v = e.calories ?? e.parsed?.calories ?? e.parsed?.kcal ?? e.parsed?.nutrition?.calories ?? 0;
      const n = typeof v === "number" ? v : Number(v);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [entries]);

  const macros = useMemo(() => {
    return entries.reduce(
      (acc, e) => {
        const protein = e.proteinG ?? e.parsed?.macros?.proteinG ?? e.parsed?.proteinG ?? 0;
        const carbs = e.carbsG ?? e.parsed?.macros?.carbsG ?? e.parsed?.carbsG ?? 0;
        const fat = e.fatG ?? e.parsed?.macros?.fatG ?? e.parsed?.fatG ?? 0;

        const p = Number(protein);
        const c = Number(carbs);
        const f = Number(fat);

        return {
          proteinG: (acc.proteinG ?? 0) + (Number.isFinite(p) ? p : 0),
          carbsG: (acc.carbsG ?? 0) + (Number.isFinite(c) ? c : 0),
          fatG: (acc.fatG ?? 0) + (Number.isFinite(f) ? f : 0),
        };
      },
      { proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [entries]);

  // diet score for TODAY: use latest score for selected plan
  const dietTodayScore = useMemo(() => {
    if (!planId) return null;

    const scores = entries
      .map((e) => e.scores?.find((s) => s.plan.id === planId)?.score)
      .filter((x): x is number => typeof x === "number");

    if (!scores.length) return null;
    return scores[0]; // newest-first
  }, [entries, planId]);

  /* ------------------------------
     ✅ Setup notices (each hides independently)
  --------------------------------*/
  const hasPlan = Boolean(planId);
  const hasCalorieGoal = Boolean(me?.dailyCalorieGoal);
  const hasEntries = entries.length > 0;

  const showPlanMsg = !hasPlan;
  const showGoalMsg = !hasCalorieGoal;
  const showEntriesMsg = !hasEntries;

  const showAnySetupMsg = showPlanMsg || showGoalMsg || showEntriesMsg;

  /* ---- Add food (existing controlled) ---- */
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitEntry() {
    const text = newText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, date: ymd }),
      });

      if (!res.ok) return;

      setNewText("");
      await refreshEntriesForDay(ymd);
      await refreshStreak();
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Manual nutrition form ---- */
  const [nText, setNText] = useState("");
  const [nCalories, setNCalories] = useState("");
  const [nProtein, setNProtein] = useState("");
  const [nCarbs, setNCarbs] = useState("");
  const [nFat, setNFat] = useState("");
  const [nSubmitting, setNSubmitting] = useState(false);
  const [nMsg, setNMsg] = useState<string | null>(null);

  async function submitNutritionEntry() {
    const text = nText.trim();
    if (!text || nSubmitting) return;

    const calories = toNumOrEmpty(nCalories);
    const proteinG = toNumOrEmpty(nProtein);
    const carbsG = toNumOrEmpty(nCarbs);
    const fatG = toNumOrEmpty(nFat);

    setNSubmitting(true);
    setNMsg(null);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          date: ymd,
          calories,
          proteinG,
          carbsG,
          fatG,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNMsg(j?.error ?? "Failed to save nutrition entry");
        return;
      }

      setNText("");
      setNCalories("");
      setNProtein("");
      setNCarbs("");
      setNFat("");

      await refreshEntriesForDay(ymd);
      await refreshStreak();
      setNMsg("Saved ✅");
    } finally {
      setNSubmitting(false);
    }
  }

  // Barcode Scanner Portion //
  async function submitBarcode(barcode: string) {
    const res = await fetch("/api/nutrition/barcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode, date: ymd }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j?.error ?? "Barcode lookup failed");
    }

    await refreshEntriesForDay(ymd);
    await refreshStreak();
  }

  /* Submit meal Via Photo Code is here */

  type MealScanResult = {
    title: string;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    sugarG?: number | null;
    fiberG?: number | null;
    satFatG?: number | null;
    confidence?: number | null;
    notes?: string | null;
    items?: Array<{
      name: string;
      confidence?: number | null;
      servings?: number | null;
      foodGroup?: "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other";
      calories?: number | null;
      sugarG?: number | null;
      addedSugarG?: number | null;
      fiberG?: number | null;
      satFatG?: number | null;
      sodiumMg?: number | null;
      tags?: string[];
    }> | null;
  };

  async function submitMealPhoto(file: File): Promise<MealScanResult> {
    const fd = new FormData();
    fd.append("image", file);

    const scanRes = await fetch("/api/meal/scan", {
      method: "POST",
      body: fd,
    });

    const scanJson = await scanRes.json().catch(() => ({}));
    if (!scanRes.ok) throw new Error(scanJson?.error ?? "Meal scan failed");

    const r = scanJson?.result ?? null;
    if (!r) throw new Error("Meal scan returned no result");

    // Return the draft (do NOT save here)
    return {
      title: String(r.title ?? "Scanned meal"),
      calories: r.calories ?? null,
      proteinG: r.proteinG ?? null,
      carbsG: r.carbsG ?? null,
      fatG: r.fatG ?? null,
      sugarG: r.sugarG ?? null,
      fiberG: r.fiberG ?? null,
      satFatG: r.satFatG ?? null,
      confidence: r.confidence ?? null,
      notes: r.notes ?? null,
      items: Array.isArray(r.items) ? r.items : null,
    };
  }

  async function saveScannedMeal(draft: MealScanResult) {
    const saveRes = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: draft.title,
        date: ymd,
        calories: draft.calories,
        proteinG: draft.proteinG,
        carbsG: draft.carbsG,
        fatG: draft.fatG,
        sugarG: draft.sugarG ?? null,
        fiberG: draft.fiberG ?? null,
        satFatG: draft.satFatG ?? null,
        parsed: {
          source: "mealPhoto",
          confidence: draft.confidence ?? null,
          notes: draft.notes ?? null,
          items: draft.items ?? null,
          nutrition: {
            sugarG: draft.sugarG ?? null,
            fiberG: draft.fiberG ?? null,
            satFatG: draft.satFatG ?? null,
          },
        },
      }),
    });

    const saveJson = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) throw new Error(saveJson?.error ?? "Failed to save meal entry");

    // refresh entries
    const refreshed = await fetch(`/api/entries?date=${encodeURIComponent(ymd)}`, {
      cache: "no-store",
    });
    const jj = await refreshed.json().catch(() => ({}));
    setEntries(Array.isArray(jj?.entries) ? jj.entries : []);
    await refreshStreak();
  }

  // Display Of Page Is Here //
  return (
    <main className={styles.container}>
      {/* PERSONAL HEADER */}
      <div className={styles.headerRow}>
        <div className={styles.headerIntro}>
          <div className={styles.headerAvatar} aria-hidden="true">
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className={styles.headerAvatarImage} />
            ) : (
              <span>{(firstName?.[0] || me?.username?.[0] || "U").toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>{encouragement.title}</h1>
            <div className={styles.muted} style={{ marginTop: 6 }}>
              {encouragement.line}
            </div>
          </div>
        </div>

        <div className={styles.streakStat} aria-label="Current logging streak">
          <div className={styles.streakLine}>
            <span className={styles.streakValue}>{streakDays}</span>
            <span className={styles.small}>
              {streakDays === 1 ? "day in a row" : "days in a row"}
            </span>
          </div>
          <div className={styles.streakNote}>Consistency beats intensity.</div>
        </div>
      </div>

      {/* MOBILE DATE SCROLLER */}
      <section className={styles.card} style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => setYmd(addDays(ymd, -1))}
            style={{
              width: 56,
              height: 56,
              fontSize: 28,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: "pointer",
            }}
            aria-label="Previous day"
          >
            ‹
          </button>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{friendlyDateLabel(ymd)}</div>
            <div className={styles.muted}>{ymd}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!canGoNext) return;
              setYmd(addDays(ymd, 1));
            }}
            disabled={!canGoNext}
            style={{
              width: 56,
              height: 56,
              fontSize: 28,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              cursor: canGoNext ? "pointer" : "not-allowed",
              opacity: canGoNext ? 1 : 0.4,
            }}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </section>

      {/* ✅ ONE CONTAINER SETUP NOTICE (items hide independently) */}
      {showAnySetupMsg && (
        <section className={`${styles.card} ${styles.setupNotice}`}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>To unlock the gauges:</div>
          <ul>
            {showPlanMsg && (
              <li>
                Choose a diet plan in <a href="/plans">Plans</a>.
              </li>
            )}
            {showGoalMsg && (
              <li>
                Set your daily calorie goal in <a href="/plans">Plans</a>.
              </li>
            )}
            {showEntriesMsg && <li>Log at least one meal below (text, barcode, or photo).</li>}
          </ul>
        </section>
      )}

      {/* MAIN STACK */}
      <CaloriesCard
        me={
          me
            ? {
                username: me.username,
                dailyCalorieGoal: me.dailyCalorieGoal ?? null,
              }
            : null
        }
        todayCals={todayCals}
        goal={me?.dailyCalorieGoal ?? null}
        planName={planName}
        planType={planType}
        planTemplateSlug={planTemplateSlug}
        dietTodayScore={dietTodayScore}
        todayFoods={todayFoods}
        macros={macros}
        onUpdateFood={updateFoodEntry}
        onDeleteFood={deleteFoodEntry}
      />

      {/* ONE ADD CARD WITH MODE TOGGLE */}
      <section className={styles.card} style={{ marginTop: 18 }}>
        <div className={styles.h2Row} style={{ marginBottom: 10 }}>
          <h2 className={styles.h2} style={{ margin: 0 }}>
            Add food
          </h2>
          <span className={styles.small}>{addMode === "quick" ? "Fast" : "Precise"}</span>
        </div>

        <div className={styles.muted} style={{ marginTop: 6 }}>
          Quick add is fast. Manual nutrition is best when you have label numbers.
        </div>

        <div className={styles.btnRow} style={{ marginTop: 12 }}>
          <button
            type="button"
            className={`${styles.btn} ${addMode === "quick" ? styles.btnPrimary : ""}`}
            onClick={() => setAddMode("quick")}
          >
            Quick add
          </button>

          <button
            type="button"
            className={`${styles.btn} ${addMode === "manual" ? styles.btnPrimary : ""}`}
            onClick={() => setAddMode("manual")}
          >
            Manual nutrition
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {addMode === "quick" ? (
            <AddFoodCard
              newText={newText}
              setNewText={setNewText}
              submitting={submitting}
              onSubmit={submitEntry}
              onBarcode={submitBarcode}
              onMealPhoto={submitMealPhoto} // returns draft
              onSaveMealDraft={saveScannedMeal} // saves entry + refresh
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={nText}
                onChange={(e) => setNText(e.target.value)}
                placeholder="Food name (e.g., Salmon bowl)"
                className={styles.input}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <input
                  value={nCalories}
                  onChange={(e) => setNCalories(e.target.value)}
                  placeholder="Calories"
                  className={styles.input}
                  inputMode="numeric"
                />
                <input
                  value={nProtein}
                  onChange={(e) => setNProtein(e.target.value)}
                  placeholder="Protein (g)"
                  className={styles.input}
                  inputMode="decimal"
                />
                <input
                  value={nCarbs}
                  onChange={(e) => setNCarbs(e.target.value)}
                  placeholder="Carbs (g)"
                  className={styles.input}
                  inputMode="decimal"
                />
                <input
                  value={nFat}
                  onChange={(e) => setNFat(e.target.value)}
                  placeholder="Fat (g)"
                  className={styles.input}
                  inputMode="decimal"
                />
              </div>

              <button type="button" onClick={submitNutritionEntry} disabled={nSubmitting} className={styles.authBtn}>
                {nSubmitting ? "Saving…" : "Save nutrition entry"}
              </button>

              {nMsg && <div className={styles.muted}>{nMsg}</div>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
