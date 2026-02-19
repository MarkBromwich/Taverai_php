import { NextResponse } from "next/server";

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
  // naive: count repeated phrases; good enough for MVP
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

  const keys = Array.from(byDay.keys()).sort(); // ascending
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
    planId,
    recent,
    overallAvg,
    bestDay: bestDay ?? null,
    worstDay: worstDay ?? null,
    foods,
    dayScores,
    avgCalories: avg(calVals),
  };
}

function buildCoachAnswer(questionRaw: string, summary: ReturnType<typeof summarize>) {
  const q = (questionRaw || "").trim().toLowerCase();

  const lines: string[] = [];
  lines.push(summary.planName ? `Plan: ${summary.planName}` : `Plan: (none selected)`);
  lines.push("");

  if (!summary.recent.length) {
    lines.push("You don’t have any entries in the selected window yet.");
    lines.push("Log a few meals and I’ll start spotting patterns and giving targeted swaps.");
    return lines.join("\n");
  }

  // baseline snapshot
  lines.push(`Last ${summary.dayScores.length} logged days:`);
  lines.push(`• Avg score: ${summary.overallAvg ?? "—"}/100`);
  lines.push(`• Avg calories: ${summary.avgCalories ?? "—"}`);
  if (summary.bestDay) lines.push(`• Best day: ${summary.bestDay.key} (score ${summary.bestDay.score}/100)`);
  if (summary.worstDay) lines.push(`• Tough day: ${summary.worstDay.key} (score ${summary.worstDay.score}/100)`);
  lines.push("");

  if (summary.foods.length) {
    lines.push("Most repeated entries:");
    for (const f of summary.foods) lines.push(`• ${f.text} (${f.n}×)`);
    lines.push("");
  }

  // question intents
  if (q.includes("why") && (q.includes("low") || q.includes("bad") || q.includes("drop"))) {
    lines.push("Why scores may have dipped:");
    lines.push("• Check your “tough day” and compare it to your best day — what foods differ?");
    lines.push("• If your plan score has reasons/breakdown, we can surface the top reasons next.");
    lines.push("");
    lines.push("Try this:");
    lines.push("• Log one simple “anchor meal” you know fits your plan (lean protein + veg + healthy fat).");
    lines.push("• Keep snacks simple (fruit, yogurt, nuts) to avoid a late-day score collapse.");
    return lines.join("\n");
  }

  if (q.includes("swap") || q.includes("replace") || q.includes("on track") || q.includes("get back")) {
    lines.push("3 easy ‘get back on track’ swaps (based on typical patterns):");
    lines.push("• If you often log bread/pasta → swap one meal to salad + olive oil + protein.");
    lines.push("• If you often log cookies/chips → swap to fruit + yogurt or nuts.");
    lines.push("• If dinners are heavy → do a lighter dinner and a stronger breakfast tomorrow.");
    lines.push("");
    lines.push("If you tell me what meal is hardest (breakfast/lunch/dinner), I’ll narrow this down.");
    return lines.join("\n");
  }

  if (q.includes("best") || q.includes("what worked") || q.includes("help")) {
    lines.push("What seems to work (based on your history):");
    if (summary.bestDay) {
      lines.push(`• Your best day was ${summary.bestDay.key}. Look at what you logged that day and repeat it once this week.`);
    }
    lines.push("• Repeat your top high-quality foods (lean protein, veggies, olive oil, fruit).");
    lines.push("• Keep ultra-processed snacks from stacking up late in the day.");
    return lines.join("\n");
  }

  // default
  lines.push("Ask me something like:");
  lines.push("• “Why was my score low this week?”");
  lines.push("• “What 3 swaps fit my history?”");
  lines.push("• “What foods help my plan the most?”");
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    const horizonDays = clamp(Number(body?.horizonDays ?? 30), 7, 90);

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    // Pull entries from your existing API route by internal fetch:
    // NOTE: This assumes /api/entries exists and returns { entries: [...] }.
    // If you prefer direct DB access here later, we can do that too.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const res = await fetch(`${baseUrl}/api/entries`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    const entries: Entry[] = Array.isArray(j?.entries) ? j.entries : [];

    const summary = summarize(entries, horizonDays);
    const answer = buildCoachAnswer(question, summary);

    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err ?? "Unknown error") },
      { status: 500 }
    );
  }
}