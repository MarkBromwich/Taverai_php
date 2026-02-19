type ReasonTone = "positive" | "negative" | "neutral";

type HumanizedReason = {
  icon: string;
  text: string;
  tone: ReasonTone;
};

function classify(raw: string): ReasonTone {
  if (raw.startsWith("+")) return "positive";
  if (raw.startsWith("-")) return "negative";
  return "neutral";
}

function iconFor(tone: ReasonTone) {
  if (tone === "positive") return "✅";
  if (tone === "negative") return "⚠️";
  return "ℹ️";
}

function rewrite(raw: string): string {
  const clean = raw.replace(/^[-+]/, "").toLowerCase();

  if (clean.includes("mediterranean")) {
    return "Lots of Mediterranean-friendly foods";
  }

  if (clean.includes("vegetable")) {
    return "You ate plenty of vegetables";
  }

  if (clean.includes("processed")) {
    return "Processed foods held you back";
  }

  if (clean.includes("calorie")) {
    return "Calories were close to your goal";
  }

  if (clean.includes("detailed foods")) {
    return "More detailed foods will unlock smarter insights";
  }

  // fallback — still readable
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function humanizeReasons(
  reasons: string[],
  timeframe: "today" | "this week" | "this month"
): HumanizedReason[] {
  return reasons.map((raw) => {
    const tone = classify(raw);
    return {
      icon: iconFor(tone),
      tone,
      text: `${rewrite(raw)} ${timeframe}`,
    };
  });
}