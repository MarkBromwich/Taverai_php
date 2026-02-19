export type StatusLevel = "good" | "warn" | "bad" | "na";

export type ScoreStatus = {
  level: StatusLevel;
  label: string;
  color: string;
  bg: string;
  border: string;
};

// This drives the color of the gauges based on status

export function scoreStatus(score: number) {
  if (score >= 80) {
    return {
      label: "Good",
      color: "var(--good)",
      bg: "rgba(118,199,192,0.32)",
      border: "rgba(118,199,192,0.65)",
    };
  }

  if (score >= 65) {
    return {
      label: "Okay",
      color: "var(--warn)",
      bg: "rgba(250,204,21,0.40)",   
      border: "rgba(250,204,21,0.75)",
    };
  }

  return {
    label: "Low",
    color: "var(--bad)",
    bg: "rgba(239,68,68,0.32)",
    border: "rgba(239,68,68,0.65)",
  };
}