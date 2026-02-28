"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./plans.module.css";

type Plan = {
  id: string;
  name: string;
  type?: string;
  config: any;
  createdAt: string;
};

type Me = {
  username: string;
  dailyCalorieGoal: number | null;
};

type PlanTemplate = {
  slug: string;
  name: string;
  category: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function PlansPage() {
  console.log("✅ PlansPage UPDATED", new Date().toISOString());

  const [plans, setPlans] = useState<Plan[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [tLoading, setTLoading] = useState(false);
  const [tErr, setTErr] = useState<string | null>(null);

  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string>("");
  const [addingTemplate, setAddingTemplate] = useState(false);

  const [goalEnabled, setGoalEnabled] = useState(true);
  const [goalValue, setGoalValue] = useState<number>(2000);

  const [calName, setCalName] = useState("Calories Plan");
  const [calTarget, setCalTarget] = useState("2000");
  const [customName, setCustomName] = useState("Muscle Gain Builder");
  const [customCalories, setCustomCalories] = useState("3000");
  const [carbMin, setCarbMin] = useState("35");
  const [carbMax, setCarbMax] = useState("45");
  const [proteinMin, setProteinMin] = useState("25");
  const [proteinMax, setProteinMax] = useState("35");
  const [fatMin, setFatMin] = useState("20");
  const [fatMax, setFatMax] = useState("30");
  const [customPreset, setCustomPreset] = useState("muscle-gain");
  const [addingCustom, setAddingCustom] = useState(false);

  function handle401(res: Response) {
    if (res.status === 401) {
      setAuthRequired(true);
      setMsg("Session expired. Please log in again.");
      return true;
    }
    return false;
  }

  async function loadMe() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (handle401(res)) return;

    const data = await res.json();
    const u: Me = data.user;
    setMe(u);

    if (u.dailyCalorieGoal == null) {
      setGoalEnabled(false);
      setGoalValue(2000);
    } else {
      setGoalEnabled(true);
      setGoalValue(clamp(Number(u.dailyCalorieGoal), 1200, 4500));
    }
  }

  async function loadPlans() {
    const res = await fetch("/api/plans", { cache: "no-store" });
    if (handle401(res)) return;

    const data = await res.json();
    setPlans(data.plans ?? []);
  }

  async function loadTemplates() {
    setTLoading(true);
    setTErr(null);

    try {
      const res = await fetch("/api/plan-templates", { cache: "no-store" });
      if (handle401(res)) return;

      const data = await res.json();
      const rows = Array.isArray(data?.templates) ? data.templates : [];

      // hide WeightWatchers in UI
      const filtered = rows.filter((t: PlanTemplate) => t.slug !== "weightwatchers");

      setTemplates(filtered);

      // default dropdown selection
      setSelectedTemplateSlug((prev) => {
        if (prev) return prev;
        return filtered.length ? filtered[0].slug : "";
      });
    } catch {
      setTErr("Failed to load plan templates");
      setTemplates([]);
    } finally {
      setTLoading(false);
    }
  }

  useEffect(() => {
    void loadMe();
    void loadPlans();
    void loadTemplates();
  }, []);

  const templatesByCategory = useMemo(() => {
    const map = new Map<string, PlanTemplate[]>();
    for (const t of templates) {
      const key = t.category || "OTHER";
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [templates]);

  async function saveGoal() {
    const res = await fetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyCalorieGoal: goalEnabled ? Number(goalValue) : null,
      }),
    });

    if (handle401(res)) return;

    const data = await res.json();
    setMe(data.user);
    setMsg("Daily calorie goal saved ✅");
  }

  async function addPlanFromTemplate(slug: string) {
    setMsg(null);
    setAddingTemplate(true);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: slug }),
      });

      if (handle401(res)) return;

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error ?? "Failed to add plan");
        return;
      }

      if (data?.plan) {
        setPlans((prev) => [data.plan, ...prev]);
      } else {
        await loadPlans();
      }

      setMsg("Plan added ✅");
    } finally {
      setAddingTemplate(false);
    }
  }

  async function addCaloriePlan() {
    setMsg(null);

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CALORIE",
        name: calName,
        config: { targetCalories: Number(calTarget) },
      }),
    });

    if (handle401(res)) return;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.error ?? "Failed to add plan");
      return;
    }

    await loadPlans();
    setMsg("Plan added ✅");
  }

  function applyCustomPreset(preset: string) {
    setCustomPreset(preset);
    if (preset === "muscle-gain") {
      setCustomName("Muscle Gain Builder");
      setCustomCalories("3000");
      setCarbMin("35");
      setCarbMax("45");
      setProteinMin("25");
      setProteinMax("35");
      setFatMin("20");
      setFatMax("30");
      return;
    }
    if (preset === "high-protein-cut") {
      setCustomName("High Protein Cut");
      setCustomCalories("2200");
      setCarbMin("20");
      setCarbMax("30");
      setProteinMin("35");
      setProteinMax("45");
      setFatMin("20");
      setFatMax("30");
      return;
    }
    setCustomName("Custom Builder");
    setCustomCalories("2500");
    setCarbMin("30");
    setCarbMax("40");
    setProteinMin("25");
    setProteinMax("35");
    setFatMin("20");
    setFatMax("30");
  }

  async function addCustomPlan() {
    setMsg(null);
    setAddingCustom(true);
    try {
      const cMin = Number(carbMin) / 100;
      const cMax = Number(carbMax) / 100;
      const pMin = Number(proteinMin) / 100;
      const pMax = Number(proteinMax) / 100;
      const fMin = Number(fatMin) / 100;
      const fMax = Number(fatMax) / 100;
      const totalMin = cMin + pMin + fMin;
      const totalMax = cMax + pMax + fMax;

      if (
        !Number.isFinite(cMin) || !Number.isFinite(cMax) ||
        !Number.isFinite(pMin) || !Number.isFinite(pMax) ||
        !Number.isFinite(fMin) || !Number.isFinite(fMax)
      ) {
        setMsg("Enter valid macro percentages.");
        return;
      }
      if (totalMin > 1.05 || totalMax < 0.95) {
        setMsg("Your macro ranges should roughly cover 100% together.");
        return;
      }

      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MEDITERRANEAN",
          name: customName,
          config: {
            templateSlug: "custom",
            targetCalories: Number(customCalories),
            scoringProfile: {
              slug: "custom",
              label: customName,
              carbs: { min: cMin, max: cMax },
              protein: { min: pMin, max: pMax },
              fat: { min: fMin, max: fMax },
              penaltyDivisor: 0.24,
            },
          },
        }),
      });

      if (handle401(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error ?? "Failed to add custom plan");
        return;
      }

      await loadPlans();
      setMsg("Custom plan added ✅");
    } finally {
      setAddingCustom(false);
    }
  }

  async function deletePlan(id: string) {
    const res = await fetch(`/api/plans?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (handle401(res)) return;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data?.error ?? "Failed to delete plan");
      return;
    }

    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  if (authRequired) {
    return (
      <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
        <h1>Choose Your Diet Plan</h1>
        <p>Your session expired.</p>
        <a href={`/login?next=${encodeURIComponent("/plans")}`}>Go to login</a>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1>Choose Your Diet Plan</h1>
        {me?.username ? <p className={styles.subtle}>Signed in as {me.username}</p> : null}
      </div>

      {msg && <p className={styles.subtle}>{msg}</p>}

      {/* Daily Calorie Goal */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Daily Calorie Goal</h2>

        <label className={styles.subtle}>
          <input
            type="checkbox"
            checked={goalEnabled}
            onChange={(e) => setGoalEnabled(e.target.checked)}
          />{" "}
          Enable goal
        </label>

        <div className={styles.rangeWrapper} style={{ opacity: goalEnabled ? 1 : 0.5 }}>
          <div className={styles.rangeHeader}>
            <span>Calories/day</span>
            <span>
              <strong>{goalEnabled ? goalValue : "—"}</strong>
            </span>
          </div>

          <input
            type="range"
            min={1200}
            max={4500}
            step={25}
            value={goalValue}
            disabled={!goalEnabled}
            onChange={(e) => setGoalValue(Number(e.target.value))}
            style={{ width: "100%", marginTop: 8 }}
          />

          <div className={styles.rangeScale}>
            <span>1200</span>
            <span>4500</span>
          </div>
        </div>

        <button className={styles.buttonPrimary} onClick={saveGoal} style={{ marginTop: 12 }}>
          Save goal
        </button>
      </div>

      {/* Diet Plans */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Diet Plans</h2>

        {tLoading ? (
          <div className={styles.subtle}>Loading diet types…</div>
        ) : tErr ? (
          <div className={styles.subtle}>
            {tErr}{" "}
            <button className={styles.buttonSecondary} onClick={loadTemplates}>
              Retry
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div className={styles.subtle}>No diet templates found.</div>
        ) : (
          <>
            <select
              className={styles.select}
              value={selectedTemplateSlug}
              onChange={(e) => setSelectedTemplateSlug(e.target.value)}
            >
              {templatesByCategory.map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <button
              className={styles.buttonPrimary}
              disabled={!selectedTemplateSlug || addingTemplate}
              onClick={() => addPlanFromTemplate(selectedTemplateSlug)}
              style={{ marginTop: 12 }}
            >
              {addingTemplate ? "Adding…" : "Add selected diet plan"}
            </button>
          </>
        )}

        {/* Your Plans List */}
        <div style={{ marginTop: 24 }}>
          <h3>Your Plans</h3>

          {plans.length === 0 ? (
            <p className={styles.subtle}>No plans yet.</p>
          ) : (
            <div className={styles.planList}>
              {plans.map((p) => (
                <div key={p.id} className={styles.planItem}>
                  <div>
                    <strong>{p.name}</strong>
                    {p.type ? ` — ${p.type}` : ""}
                    {p.config?.targetCalories ? ` (target ${p.config.targetCalories})` : ""}
                  </div>

                  <button className={styles.buttonSecondary} onClick={() => deletePlan(p.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Custom Diet Plan Builder</h2>
        <p className={styles.subtle}>
          Build a plan around your own macro strategy, like bulking, cutting, or a high-protein lifting phase.
        </p>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.subtle}>Preset</span>
            <select
              className={styles.select}
              value={customPreset}
              onChange={(e) => applyCustomPreset(e.target.value)}
            >
              <option value="muscle-gain">Muscle gain</option>
              <option value="high-protein-cut">High-protein cut</option>
              <option value="custom">Balanced custom</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.subtle}>Plan name</span>
            <input
              className={styles.input}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Powerlifting Bulk"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.subtle}>Target calories</span>
            <input
              className={styles.input}
              type="number"
              min={1200}
              max={5000}
              step={25}
              value={customCalories}
              onChange={(e) => setCustomCalories(e.target.value)}
            />
          </label>
        </div>

        <div className={styles.macroBuilder}>
          <div className={styles.macroCard}>
            <div className={styles.macroTitle}>Carbs %</div>
            <div className={styles.macroRange}>
              <input className={styles.input} type="number" value={carbMin} onChange={(e) => setCarbMin(e.target.value)} />
              <span className={styles.rangeDash}>to</span>
              <input className={styles.input} type="number" value={carbMax} onChange={(e) => setCarbMax(e.target.value)} />
            </div>
          </div>
          <div className={styles.macroCard}>
            <div className={styles.macroTitle}>Protein %</div>
            <div className={styles.macroRange}>
              <input className={styles.input} type="number" value={proteinMin} onChange={(e) => setProteinMin(e.target.value)} />
              <span className={styles.rangeDash}>to</span>
              <input className={styles.input} type="number" value={proteinMax} onChange={(e) => setProteinMax(e.target.value)} />
            </div>
          </div>
          <div className={styles.macroCard}>
            <div className={styles.macroTitle}>Fat %</div>
            <div className={styles.macroRange}>
              <input className={styles.input} type="number" value={fatMin} onChange={(e) => setFatMin(e.target.value)} />
              <span className={styles.rangeDash}>to</span>
              <input className={styles.input} type="number" value={fatMax} onChange={(e) => setFatMax(e.target.value)} />
            </div>
          </div>
        </div>

        <button className={styles.buttonPrimary} onClick={addCustomPlan} disabled={addingCustom} style={{ marginTop: 12 }}>
          {addingCustom ? "Adding…" : "Add custom plan"}
        </button>
      </div>
    </main>
  );
}
