export type MacroTarget = { min: number; max: number };

export type DietScoringProfile = {
  slug: string;
  label: string;
  carbs: MacroTarget;
  fat: MacroTarget;
  protein: MacroTarget;
  // Larger divisor = gentler penalty outside target range.
  penaltyDivisor: number;
};

const DEFAULT_PROFILE: DietScoringProfile = {
  slug: "mediterranean",
  label: "Mediterranean",
  carbs: { min: 0.42, max: 0.65 },
  fat: { min: 0.20, max: 0.40 },
  protein: { min: 0.10, max: 0.35 },
  penaltyDivisor: 0.30,
};

const PROFILES_BY_SLUG: Record<string, DietScoringProfile> = {
  mediterranean: DEFAULT_PROFILE,
  dash: {
    slug: "dash",
    label: "DASH",
    carbs: { min: 0.45, max: 0.60 },
    fat: { min: 0.20, max: 0.32 },
    protein: { min: 0.15, max: 0.30 },
    penaltyDivisor: 0.28,
  },
  mind: {
    slug: "mind",
    label: "MIND",
    carbs: { min: 0.42, max: 0.58 },
    fat: { min: 0.25, max: 0.40 },
    protein: { min: 0.15, max: 0.30 },
    penaltyDivisor: 0.29,
  },
  pescatarian: {
    slug: "pescatarian",
    label: "Pescatarian",
    carbs: { min: 0.40, max: 0.55 },
    fat: { min: 0.25, max: 0.40 },
    protein: { min: 0.18, max: 0.35 },
    penaltyDivisor: 0.27,
  },
  "plant-forward": {
    slug: "plant-forward",
    label: "Plant-Forward",
    carbs: { min: 0.45, max: 0.65 },
    fat: { min: 0.20, max: 0.35 },
    protein: { min: 0.12, max: 0.28 },
    penaltyDivisor: 0.30,
  },
  vegetarian: {
    slug: "vegetarian",
    label: "Vegetarian",
    carbs: { min: 0.45, max: 0.65 },
    fat: { min: 0.20, max: 0.35 },
    protein: { min: 0.12, max: 0.28 },
    penaltyDivisor: 0.30,
  },
  vegan: {
    slug: "vegan",
    label: "Vegan",
    carbs: { min: 0.50, max: 0.68 },
    fat: { min: 0.18, max: 0.32 },
    protein: { min: 0.12, max: 0.25 },
    penaltyDivisor: 0.31,
  },
  flexitarian: {
    slug: "flexitarian",
    label: "Flexitarian",
    carbs: { min: 0.42, max: 0.62 },
    fat: { min: 0.22, max: 0.37 },
    protein: { min: 0.15, max: 0.30 },
    penaltyDivisor: 0.30,
  },
  "anti-inflammatory": {
    slug: "anti-inflammatory",
    label: "Anti-inflammatory",
    carbs: { min: 0.40, max: 0.55 },
    fat: { min: 0.25, max: 0.40 },
    protein: { min: 0.18, max: 0.32 },
    penaltyDivisor: 0.28,
  },
  "low-gi": {
    slug: "low-gi",
    label: "Low-GI",
    carbs: { min: 0.35, max: 0.50 },
    fat: { min: 0.25, max: 0.40 },
    protein: { min: 0.18, max: 0.35 },
    penaltyDivisor: 0.27,
  },
  "high-fiber": {
    slug: "high-fiber",
    label: "High-Fiber",
    carbs: { min: 0.45, max: 0.65 },
    fat: { min: 0.20, max: 0.35 },
    protein: { min: 0.12, max: 0.30 },
    penaltyDivisor: 0.30,
  },
  volumetrics: {
    slug: "volumetrics",
    label: "Volumetrics",
    carbs: { min: 0.45, max: 0.62 },
    fat: { min: 0.18, max: 0.30 },
    protein: { min: 0.15, max: 0.30 },
    penaltyDivisor: 0.27,
  },
  "high-protein": {
    slug: "high-protein",
    label: "High-Protein",
    carbs: { min: 0.20, max: 0.40 },
    fat: { min: 0.20, max: 0.35 },
    protein: { min: 0.28, max: 0.45 },
    penaltyDivisor: 0.25,
  },
  keto: {
    slug: "keto",
    label: "Keto",
    carbs: { min: 0.02, max: 0.10 },
    fat: { min: 0.60, max: 0.75 },
    protein: { min: 0.18, max: 0.32 },
    penaltyDivisor: 0.22,
  },
  paleo: {
    slug: "paleo",
    label: "Paleo",
    carbs: { min: 0.20, max: 0.35 },
    fat: { min: 0.30, max: 0.45 },
    protein: { min: 0.25, max: 0.40 },
    penaltyDivisor: 0.25,
  },
  whole30: {
    slug: "whole30",
    label: "Whole30",
    carbs: { min: 0.25, max: 0.40 },
    fat: { min: 0.30, max: 0.45 },
    protein: { min: 0.22, max: 0.38 },
    penaltyDivisor: 0.25,
  },
  "intermittent-fasting": {
    slug: "intermittent-fasting",
    label: "Intermittent Fasting",
    carbs: { min: 0.35, max: 0.55 },
    fat: { min: 0.22, max: 0.38 },
    protein: { min: 0.18, max: 0.32 },
    penaltyDivisor: 0.30,
  },
  "gluten-free": {
    slug: "gluten-free",
    label: "Gluten-Free",
    carbs: { min: 0.40, max: 0.60 },
    fat: { min: 0.22, max: 0.36 },
    protein: { min: 0.15, max: 0.32 },
    penaltyDivisor: 0.30,
  },
  "low-fodmap": {
    slug: "low-fodmap",
    label: "Low-FODMAP",
    carbs: { min: 0.35, max: 0.50 },
    fat: { min: 0.25, max: 0.38 },
    protein: { min: 0.18, max: 0.35 },
    penaltyDivisor: 0.28,
  },
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getDietScoringProfileBySlug(slug: string | null | undefined): DietScoringProfile {
  if (!slug) return DEFAULT_PROFILE;
  const key = slugify(slug);
  return PROFILES_BY_SLUG[key] ?? DEFAULT_PROFILE;
}

export function resolveDietScoringProfile(config: any, planName?: string | null): DietScoringProfile {
  const saved = config?.scoringProfile;
  if (
    saved &&
    typeof saved === "object" &&
    saved.carbs?.min != null &&
    saved.carbs?.max != null &&
    saved.fat?.min != null &&
    saved.fat?.max != null &&
    saved.protein?.min != null &&
    saved.protein?.max != null &&
    saved.penaltyDivisor != null
  ) {
    return {
      slug: String(saved.slug ?? config?.templateSlug ?? "custom"),
      label: String(saved.label ?? planName ?? "Custom"),
      carbs: { min: Number(saved.carbs.min), max: Number(saved.carbs.max) },
      fat: { min: Number(saved.fat.min), max: Number(saved.fat.max) },
      protein: { min: Number(saved.protein.min), max: Number(saved.protein.max) },
      penaltyDivisor: Number(saved.penaltyDivisor),
    };
  }

  if (typeof config?.templateSlug === "string") {
    return getDietScoringProfileBySlug(config.templateSlug);
  }

  if (planName) return getDietScoringProfileBySlug(planName);
  return DEFAULT_PROFILE;
}
