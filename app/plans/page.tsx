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
    </main>
  );
}