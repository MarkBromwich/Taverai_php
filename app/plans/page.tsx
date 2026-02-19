"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: string;
  name: string;
  type: "CALORIE" | "MEDITERRANEAN";
  config: any;
  createdAt: string;
};

type Me = {
  username: string;
  dailyCalorieGoal: number | null;
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // goal editor
  const [goalInput, setGoalInput] = useState<string>("");

  // plan creators
  const [calName, setCalName] = useState("Calories Plan");
  const [calTarget, setCalTarget] = useState("2000");

  async function loadMe() {
    const res = await fetch("/api/me");
    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to load user");
      return;
    }

    const u: Me = data.user;
    setMe(u);
    setGoalInput(u.dailyCalorieGoal == null ? "" : String(u.dailyCalorieGoal));
  }

  async function loadPlans() {
    const res = await fetch("/api/plans");
    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to load plans");
      return;
    }

    setPlans(data.plans ?? []);
  }

  useEffect(() => {
    loadMe();
    loadPlans();
  }, []);

  async function saveGoal() {
    setMsg(null);

    const trimmed = goalInput.trim();
    const dailyCalorieGoal = trimmed === "" ? null : Number(trimmed);

    const res = await fetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyCalorieGoal }),
    });

    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to save daily goal");
      return;
    }

    setMe(data.user);
    setMsg("Daily calorie goal saved ✅");
  }

  async function addMediterranean() {
    setMsg(null);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "MEDITERRANEAN", name: "Mediterranean" }),
    });

    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to add plan");
      return;
    }

    setMsg("Plan added ✅");
    await loadPlans();
  }

  async function addCaloriePlan() {
    setMsg(null);
    const targetCalories = Number(calTarget);

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CALORIE",
        name: calName,
        config: { targetCalories },
      }),
    });

    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to add plan");
      return;
    }

    setMsg("Plan added ✅");
    await loadPlans();
  }

  async function deletePlan(id: string) {
    setMsg(null);
    const res = await fetch(`/api/plans?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const txt = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    if (!res.ok) {
      setMsg(data?.error ?? txt ?? "Failed to delete plan");
      return;
    }

    setMsg("Plan deleted ✅");
    await loadPlans();
  }

  return (
    <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
      <h1>Choose Your Diet Plan</h1>
      <p style={{ opacity: 0.75, marginTop: 6 }}>
        Set your daily calorie goal here, and add diet plans you want scored.
      </p>

      <div style={{ marginTop: 10 }}>
        <a href="/log">← Back to log</a>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {/* Daily calorie goal */}
      <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Daily Calorie Goal</h2>
        <div style={{ fontSize: 14, marginBottom: 10 }}>
          <strong>User:</strong> {me?.username ?? "…"}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              Calories per day (leave blank to clear)
            </div>
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="e.g. 2000"
              inputMode="numeric"
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
            />
          </div>

          <button
            style={{
              padding: "11px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onClick={saveGoal}
          >
            Save goal
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          This goal is used on the Log page for tracking progress.
        </div>
      </div>

      {/* Diet plans */}
      <div style={{ marginTop: 12, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Diet Plans</h2>

        <div style={{ marginTop: 10 }}>
          <button style={{ padding: 12, width: "100%" }} onClick={addMediterranean}>
            Add Mediterranean Plan
          </button>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
            (Optional) Add Calories Plan for future comparisons
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={{ flex: 1, padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              value={calName}
              onChange={(e) => setCalName(e.target.value)}
              placeholder="Plan name"
            />
            <input
              style={{ width: 140, padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              value={calTarget}
              onChange={(e) => setCalTarget(e.target.value)}
              placeholder="Target"
              inputMode="numeric"
            />
          </div>

          <button style={{ marginTop: 10, padding: 12, width: "100%" }} onClick={addCaloriePlan}>
            Add Calories Plan
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 8 }}>Your Plans</h3>
          {plans.length === 0 ? (
            <p>No plans yet.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {plans.map((p) => (
                <li key={p.id} style={{ marginBottom: 12 }}>
                  <div>
                    <strong>{p.name}</strong> — {p.type}
                    {p.type === "CALORIE" ? ` (target ${p.config?.targetCalories})` : ""}
                  </div>
                  <button style={{ marginTop: 6, padding: 10 }} onClick={() => deletePlan(p.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}