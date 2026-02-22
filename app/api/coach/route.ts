// app/api/coach/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

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

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function topFoods(entries: Entry[], limit = 6) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const t = (e.text || "").trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, n]) => ({ text, n }));
}

function summarize(entries: Entry[], horizonDays: number) {
  const now = new Date();
  const cutoff = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (horizonDays - 1)));

  const recent = entries.filter((e) => new Date(e.createdAt) >= cutoff);
  const plan = pickPrimaryPlan(recent);
  const planId = plan?.id ?? null;

  const byDay = new Map<string, Entry[]>();
  for (const e of recent) {
    const key = dateKeyLocal(startOfLocalDay(new Date(e.createdAt)));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }

  const keys = Array.from(byDay.keys()).sort();
  const dayScores: Array<{ key: string; score: number | null; cals: number }> = [];

  for (const k of keys) {
    const list = byDay.get(k) ?? [];
    const scores: number[] = [];
    let cals = 0;

    for (const e of list) {
      const s = scoreForEntry(e, planId);
      if (typeof s === "number") scores.push(s);
      cals += entryCalories(e.parsed);
    }

    dayScores.push({ key: k, score: avg(scores), cals: Math.round(cals) });
  }

  const scoreVals = dayScores.map((d) => d.score).filter((x): x is number => typeof x === "number");
  const calVals = dayScores.map((d) => d.cals).filter((x): x is number => typeof x === "number");

  const overallAvg = avg(scoreVals);
  const bestDay = dayScores
    .filter((d) => typeof d.score === "number")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const worstDay = dayScores
    .filter((d) => typeof d.score === "number")
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const foods = topFoods(recent, 6);

  return {
    planName: plan?.name ?? null,
    planType: plan?.type ?? null,
    planId,
    overallAvg,
    bestDay: bestDay ?? null,
    worstDay: worstDay ?? null,
    foods,
    dayScores,
    avgCalories: avg(calVals),
    loggedDays: dayScores.length,
    entryCount: recent.length,
  };
}

function getBaseUrl(req: Request) {
  // Prefer your deployed URL if you set it, otherwise derive from request host
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function coachSystemPrompt() {
  return [
    "You are Taverai Coach: supportive, practical, and concise.",
    "Your job: analyze the user's recent nutrition log summary and answer their question.",
    "Output format MUST be plain text with these sections:",
    "1) Snapshot (2 bullets max)",
    "2) What to do next (3 bullets max, specific and doable)",
    "3) One simple swap (1 bullet)",
    "4) Encouragement (1 short sentence)",
    "",
    "Rules:",
    "- Do not mention being an AI.",
    "- Do not ask more than one follow-up question. (Prefer none.)",
    "- If the user has no logged days, tell them exactly what to log next and keep it motivating.",
    "- Keep it 'blended': a little motivational + tactical + data-aware.",
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    const horizonDays = clamp(Number(body?.horizonDays ?? 30), 7, 90);

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    // ✅ IMPORTANT FIX:
    // Forward the cookie so /api/entries sees the logged-in user on Render.
    const cookie = req.headers.get("cookie") ?? "";
    const baseUrl = getBaseUrl(req);

    const res = await fetch(`${baseUrl}/api/entries?horizonDays=${encodeURIComponent(String(horizonDays))}`, {
      cache: "no-store",
      headers: { cookie },
    });

    const j = await res.json().catch(() => ({}));
    const entries: Entry[] = Array.isArray(j?.entries) ? j.entries : [];

    const summary = summarize(entries, horizonDays);

    // If there’s truly no data, don’t waste tokens.
    if (!summary.loggedDays) {
      const answer =
        `Plan: ${summary.planName ?? "(none selected)"}\n\n` +
        `Snapshot:\n• No logged meals in the last ${horizonDays} days.\n\n` +
        `What to do next:\n• Log your next meal (photo or text) with a short description.\n• Log one snack today.\n• Come back and ask “What should I improve first?”\n\n` +
        `One simple swap:\n• Swap one sugary drink/snack for water + fruit.\n\n` +
        `Encouragement:\nYou’re one log away from making this useful.`;
      return NextResponse.json({ answer });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model = process.env.OPENAI_COACH_MODEL || process.env.OPENAI_MEAL_MODEL || "gpt-4.1-mini";

    const input = [
      { role: "system", content: coachSystemPrompt() },
      {
        role: "user",
        content: [
          `QUESTION:\n${question}`,
          ``,
          `SUMMARY (last ${horizonDays} days):`,
          JSON.stringify(
            {
              planName: summary.planName,
              planType: summary.planType,
              loggedDays: summary.loggedDays,
              entryCount: summary.entryCount,
              overallAvg: summary.overallAvg,
              avgCalories: summary.avgCalories,
              bestDay: summary.bestDay,
              worstDay: summary.worstDay,
              foods: summary.foods,
              dayScores: summary.dayScores,
            },
            null,
            2
          ),
        ].join("\n"),
      },
    ];

    // Using Responses API (works with modern openai js)
    const r = await openai.responses.create({
      model,
      input,
      max_output_tokens: 450,
    });

    const answer = (r.output_text ?? "").trim() || "I couldn’t generate coaching text right now.";
    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Coach crashed", detail: String(err?.message ?? err ?? "Unknown error") },
      { status: 500 }
    );
  }
}