"use client";

import styles from "./log.module.css";
import type { CSSProperties } from "react";

type ScoreStatus = (score: number) => {
  label: string;
  color: string;
  bg: string;
  border: string;
};

type Props = {
  scoreStatus: ScoreStatus;
  primaryPlanName: string | null;
  hasPlan: boolean;

  todayScore: number | null;
  weekAvg: number | null;
  monthAvg: number | null;

  trendDelta?: number | null;
  trendArrow?: string;

  todayWhy?: string | null;
  weekWhy?: string | null;
  monthWhy?: string | null;
};

/* ---------- helpers ---------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct01(score: number | null) {
  if (score == null) return 0;
  return clamp(score / 100, 0, 1);
}

function dashFor(p: number) {
  const total = 100;
  const filled = Math.round(p * total);
  return `${filled} ${total - filled}`;
}

function buildHighlights(score: number | null, why: string | null) {
  const highlights: string[] = [];
  const suggestions: string[] = [];

  if (score == null) {
    highlights.push("No score yet — add a food entry to start tracking.");
    suggestions.push("Log one meal to generate your first score.");
    return { highlights, suggestions };
  }

  if (score >= 85) {
    highlights.push("Strong alignment with your plan.");
    if (why) highlights.push(why);
    suggestions.push("Keep repeating what worked.");
    suggestions.push("Stay consistent with portions/snacks.");
  } else if (score >= 70) {
    highlights.push("Mostly on track.");
    if (why) highlights.push(why);
    suggestions.push("Small swaps can boost your score.");
    suggestions.push("Aim for one “clean” meal next.");
  } else {
    highlights.push("Off track today.");
    if (why) highlights.push(why);
    suggestions.push("Pick one easy win: veggies, water, or lean protein.");
    suggestions.push("Avoid a second processed/sugary hit.");
  }

  return { highlights, suggestions };
}

function MiniGauge({
  label,
  score,
  scoreStatus,
}: {
  label: string;
  score: number | null;
  scoreStatus: ScoreStatus;
}) {
  const value = score ?? 0;
  const status = score != null ? scoreStatus(value) : null;

  const p = pct01(score);

  // ✅ Correct calibration for a TOP half-arc:
  // 0% -> 180° (left), 50% -> 90° (up), 100% -> 0° (right)
  const angle = 180 - p * 180;

  const needleColor = status?.color ?? "rgba(255,255,255,0.9)";

  const styleVars = status
    ? ({
        ["--gauge-track" as any]: "rgba(255,255,255,0.12)",
        ["--gauge-fill" as any]: status.color,
      } as CSSProperties)
    : undefined;

  // trig needle
  const rad = (angle * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const len = 80;

  const x2 = cx + Math.cos(rad) * len;
  const y2 = cy - Math.sin(rad) * len; // ✅ y inverted for screen coords

  return (
    <div className={styles.compGaugeBox} style={styleVars}>
      <div className={styles.compGaugeTopline}>
        <div className={styles.compGaugeLabel}>{label}</div>
        <div className={styles.compGaugeValue}>
          {score == null ? "—" : `${value}/100`}
        </div>
      </div>

      <svg className={styles.compGauge} viewBox="0 0 200 120" aria-hidden="true">
        {/* track */}
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="16"
          className={styles.compTrack}
        />

        {/* fill */}
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="16"
          className={styles.compFill}
          pathLength={100}
          strokeDasharray={dashFor(p)}
        />

        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke={needleColor}
          strokeWidth={6}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill={needleColor} />
      </svg>
    </div>
  );
}

function ComplianceRow({
  title,
  score,
  why,
  highlights,
  suggestions,
  scoreStatus,
}: {
  title: string;
  score: number | null;
  why: string | null;
  highlights: string[];
  suggestions: string[];
  scoreStatus: ScoreStatus;
}) {
  const status = score != null ? scoreStatus(score) : null;

  return (
    <div className={styles.compRowCard}>
      <div className={styles.compRowLeft}>
        <MiniGauge label={title} score={score} scoreStatus={scoreStatus} />
        {status && (
          <div
            className={styles.compRowBadge}
            style={
              {
                ["--pill-border" as any]: status.border,
                ["--pill-color" as any]: status.color,
              } as CSSProperties
            }
          >
            {status.label}
          </div>
        )}
      </div>

      <div className={styles.compRowRight}>
        <div className={styles.compRowSection}>
          <div className={styles.compMiniTitle}>Why</div>
          <div className={styles.compMiniText}>{why ?? "Add more meals for clearer reasons."}</div>
        </div>

        <div className={styles.compRowTwoCol}>
          <div className={styles.compRowSection}>
            <div className={styles.compMiniTitle}>Highlights</div>
            <ul className={styles.bullets}>
              {highlights.slice(0, 2).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>

          <div className={styles.compRowSection}>
            <div className={styles.compMiniTitle}>Suggestions</div>
            <ul className={styles.bullets}>
              {suggestions.slice(0, 2).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- component ---------- */

export default function ComplianceCard(props: Props) {
  const {
    scoreStatus,
    primaryPlanName,
    hasPlan,
    todayScore,
    weekAvg,
    monthAvg,
    todayWhy,
    weekWhy,
    monthWhy,
  } = props;

  const today = buildHighlights(todayScore, todayWhy ?? null);
  const week = buildHighlights(weekAvg, weekWhy ?? null);
  const month = buildHighlights(monthAvg, monthWhy ?? null);

  return (
    <section className={styles.card}>
      <div className={styles.h2Row}>
        <h2 className={styles.h2}>Compliance</h2>
        <span className={styles.small}>
          {primaryPlanName ? primaryPlanName : hasPlan ? "Plan" : "No plan selected"}
        </span>
      </div>

      <div className={styles.compStack}>
        <ComplianceRow
          title="Today"
          score={todayScore}
          why={todayWhy ?? null}
          highlights={today.highlights}
          suggestions={today.suggestions}
          scoreStatus={scoreStatus}
        />

        <ComplianceRow
          title="This week"
          score={weekAvg}
          why={weekWhy ?? null}
          highlights={week.highlights}
          suggestions={week.suggestions}
          scoreStatus={scoreStatus}
        />

        <ComplianceRow
          title="This month"
          score={monthAvg}
          why={monthWhy ?? null}
          highlights={month.highlights}
          suggestions={month.suggestions}
          scoreStatus={scoreStatus}
        />
      </div>
    </section>
  );
}