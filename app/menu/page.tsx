"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./menu.module.css";

type AnalyzedOption = {
  optionIndex: number;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  fiberG: number | null;
  fitScore: number;
  reasons: string[];
  summary: string;
};

type AnalyzeResponse = {
  plan: { id: string | null; name: string; type: string | null };
  options: AnalyzedOption[];
  ranked: AnalyzedOption[];
  bestOptionIndex: number | null;
};

type Plan = { id: string; name: string; type: string; config?: any };
type MeUser = { dailyCalorieGoal?: number | null };
type ScannedImageResult = {
  title: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  satFatG: number | null;
  notes: string | null;
};
type PlannedMeal = {
  mealType: string;
  title: string;
  description: string;
  calories: number | null;
  recipeTitle: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: Array<{
    item: string;
    amount: string;
    category: string;
  }>;
  instructions: string[];
};
type PlannerDay = {
  dayLabel: string;
  meals: PlannedMeal[];
};
type GroceryListSection = {
  category: string;
  items: string[];
};
type MealPlanResponse = {
  planName: string;
  summary: string;
  days: PlannerDay[];
  groceryList: GroceryListSection[];
  prepTips: string[];
};
type SavedMeal = {
  id: string;
  title: string;
  mealType: string | null;
  description: string | null;
  calories: number | null;
  recipe: {
    recipeTitle: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    ingredients: Array<{ item: string; amount: string; category: string }>;
    instructions: string[];
  };
  createdAt: string;
};

function formatNum(v: number | null | undefined, unit = "") {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}${unit}`;
}

function slugify(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function comparisonReasons(winner: AnalyzedOption | null, loser: AnalyzedOption | null) {
  if (!winner || !loser) return [];
  const bullets: string[] = [];

  const tryPush = (condition: boolean, text: string) => {
    if (condition && !bullets.includes(text)) bullets.push(text);
  };

  tryPush(
    winner.proteinG != null && loser.proteinG != null && winner.proteinG > loser.proteinG,
    "Higher in protein"
  );
  tryPush(
    winner.satFatG != null && loser.satFatG != null && winner.satFatG < loser.satFatG,
    "Lower in saturated fat"
  );
  tryPush(
    winner.sugarG != null && loser.sugarG != null && winner.sugarG < loser.sugarG,
    "Less sugar"
  );
  tryPush(
    winner.fiberG != null && loser.fiberG != null && winner.fiberG > loser.fiberG,
    "More fiber"
  );
  tryPush(
    winner.calories != null && loser.calories != null && winner.calories < loser.calories,
    "Lower in calories"
  );

  if (bullets.length) return bullets.slice(0, 3);
  return (winner.reasons ?? []).slice(0, 3);
}

export default function MenuPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const [compareMode, setCompareMode] = useState<"quick" | "restaurant" | "barcode">("quick");
  const [restaurant, setRestaurant] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionADetails, setOptionADetails] = useState("");
  const [optionBDetails, setOptionBDetails] = useState("");
  const [showADetails, setShowADetails] = useState(false);
  const [showBDetails, setShowBDetails] = useState(false);
  const [optionAImage, setOptionAImage] = useState<File | null>(null);
  const [optionBImage, setOptionBImage] = useState<File | null>(null);
  const [optionAPreview, setOptionAPreview] = useState<string | null>(null);
  const [optionBPreview, setOptionBPreview] = useState<string | null>(null);
  const [optionAScan, setOptionAScan] = useState<ScannedImageResult | null>(null);
  const [optionBScan, setOptionBScan] = useState<ScannedImageResult | null>(null);
  const [optionAScanning, setOptionAScanning] = useState(false);
  const [optionBScanning, setOptionBScanning] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<AnalyzeResponse | null>(null);
  const [logMessage, setLogMessage] = useState<string | null>(null);

  const [plannerPrompt, setPlannerPrompt] = useState("");
  const [plannerDays, setPlannerDays] = useState("3");
  const [plannerMeals, setPlannerMeals] = useState<string[]>(["Breakfast", "Lunch", "Dinner"]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [plannerResult, setPlannerResult] = useState<MealPlanResponse | null>(null);
  const [openRecipes, setOpenRecipes] = useState<string[]>([]);
  const [shoppingMode, setShoppingMode] = useState(false);
  const [checkedShoppingItems, setCheckedShoppingItems] = useState<string[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [savedMealsError, setSavedMealsError] = useState<string | null>(null);
  const [savingMealId, setSavingMealId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      try {
        const [meRes, plansRes, savedRes] = await Promise.all([
          fetch("/api/me", { cache: "no-store" }),
          fetch("/api/plans", { cache: "no-store" }),
          fetch("/api/menu/favorites", { cache: "no-store" }),
        ]);
        const meJson = await meRes.json().catch(() => ({}));
        const plansJson = await plansRes.json().catch(() => ({}));
        const savedJson = await savedRes.json().catch(() => ({}));
        if (cancelled) return;
        setMe(meJson?.user ?? null);
        const plans = Array.isArray(plansJson?.plans) ? plansJson.plans : [];
        setPlan(plans[plans.length - 1] ?? null);
        setSavedMeals(Array.isArray(savedJson?.meals) ? savedJson.meals : []);
      } catch {
        if (!cancelled) {
          setMe(null);
          setPlan(null);
          setSavedMeals([]);
        }
      }
    }
    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const compared = useMemo(() => compareResult?.options ?? [], [compareResult]);
  const comparedA = compared.find((x) => x.optionIndex === 0) ?? null;
  const comparedB = compared.find((x) => x.optionIndex === 1) ?? null;
  const compareUsesImages = compareMode !== "quick";
  const isSingleImageAnalysis = compareUsesImages && !!comparedA && !comparedB;
  const winner = useMemo(() => compareResult?.ranked?.[0] ?? null, [compareResult]);
  const loser = winner?.optionIndex === 0 ? comparedB : winner?.optionIndex === 1 ? comparedA : null;
  const winnerBullets = useMemo(() => comparisonReasons(winner, loser), [winner, loser]);

  useEffect(() => {
    return () => {
      if (optionAPreview) URL.revokeObjectURL(optionAPreview);
      if (optionBPreview) URL.revokeObjectURL(optionBPreview);
    };
  }, [optionAPreview, optionBPreview]);

  async function setImagePreview(which: "a" | "b", file: File | null) {
    if (which === "a") {
      if (optionAPreview) URL.revokeObjectURL(optionAPreview);
      setOptionAImage(file);
      setOptionAPreview(file ? URL.createObjectURL(file) : null);
      setOptionAScan(null);
      if (!file) setCompareResult(null);
      if (!file) return;
      setOptionAScanning(true);
      setCompareError(null);
      try {
        setOptionAScan(await scanMealImage(file));
      } catch (err: any) {
        setCompareError(String(err?.message ?? err));
      } finally {
        setOptionAScanning(false);
      }
      return;
    }
    if (optionBPreview) URL.revokeObjectURL(optionBPreview);
    setOptionBImage(file);
    setOptionBPreview(file ? URL.createObjectURL(file) : null);
    setOptionBScan(null);
    if (!file) setCompareResult(null);
    if (!file) return;
    setOptionBScanning(true);
    setCompareError(null);
    try {
      setOptionBScan(await scanMealImage(file));
    } catch (err: any) {
      setCompareError(String(err?.message ?? err));
    } finally {
      setOptionBScanning(false);
    }
  }

  async function scanMealImage(file: File): Promise<ScannedImageResult> {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/meal/scan", {
      method: "POST",
      body: formData,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error ?? "Meal scan failed");
    const result = j?.result ?? {};
    return {
      title: typeof result?.title === "string" ? result.title : "Uploaded item",
      calories: result?.calories ?? null,
      proteinG: result?.proteinG ?? null,
      carbsG: result?.carbsG ?? null,
      fatG: result?.fatG ?? null,
      sugarG: result?.sugarG ?? null,
      fiberG: result?.fiberG ?? null,
      satFatG: result?.satFatG ?? null,
      notes: typeof result?.notes === "string" ? result.notes : null,
    };
  }

  function clearCompare() {
    if (optionAPreview) URL.revokeObjectURL(optionAPreview);
    if (optionBPreview) URL.revokeObjectURL(optionBPreview);
    setRestaurant("");
    setOptionA("");
    setOptionB("");
    setOptionADetails("");
    setOptionBDetails("");
    setShowADetails(false);
    setShowBDetails(false);
    setOptionAImage(null);
    setOptionBImage(null);
    setOptionAPreview(null);
    setOptionBPreview(null);
    setOptionAScan(null);
    setOptionBScan(null);
    setOptionAScanning(false);
    setOptionBScanning(false);
    setCompareError(null);
    setCompareResult(null);
    setLogMessage(null);
  }

  function togglePlannerMeal(meal: string) {
    setPlannerMeals((current) =>
      current.includes(meal) ? current.filter((x) => x !== meal) : [...current, meal]
    );
  }

  function toggleRecipe(id: string) {
    setOpenRecipes((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function toggleShoppingItem(id: string) {
    setCheckedShoppingItems((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  async function analyzeCompare() {
    setCompareLoading(true);
    setCompareError(null);
    setLogMessage(null);
    try {
      let options: string[] = [];
      let providedNutrition: Array<Record<string, string | number | null>> = [];

      if (compareUsesImages) {
        if (!optionAImage && !optionBImage) {
          throw new Error("Upload at least one image before analyzing.");
        }
        const scans: ScannedImageResult[] = [];
        const optionLabels: string[] = [];
        if (optionAImage) {
          const scanA = optionAScan ?? (await scanMealImage(optionAImage));
          scans.push(scanA);
          optionLabels.push([restaurant.trim(), scanA.title].filter(Boolean).join(" — "));
        }
        if (optionBImage) {
          const scanB = optionBScan ?? (await scanMealImage(optionBImage));
          scans.push(scanB);
          optionLabels.push([restaurant.trim(), scanB.title].filter(Boolean).join(" — "));
        }
        options = optionLabels;
        providedNutrition = scans;
      } else {
        const a = optionA.trim();
        const b = optionB.trim();
        if (!a || !b) throw new Error("Enter both options before comparing.");
        options = [
          [restaurant.trim(), a, optionADetails.trim()].filter(Boolean).join(" — "),
          [restaurant.trim(), b, optionBDetails.trim()].filter(Boolean).join(" — "),
        ];
      }

      const context = [
        compareMode === "restaurant" && restaurant.trim() ? `Restaurant: ${restaurant.trim()}` : "",
        compareMode === "barcode" ? "Compare packaged or prepared grocery items." : "",
        compareUsesImages ? "Use provided scanned nutrition from uploaded images." : "",
        plan?.name ? `User plan: ${plan.name}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const res = await fetch("/api/menu/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options, context, providedNutrition }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Menu analysis failed");
      setCompareResult(j as AnalyzeResponse);
    } catch (err: any) {
      setCompareError(String(err?.message ?? err));
    } finally {
      setCompareLoading(false);
    }
  }

  async function logWinner() {
    if (!winner) return;
    setLogMessage(null);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: winner.name,
          calories: winner.calories,
          proteinG: winner.proteinG,
          carbsG: winner.carbsG,
          fatG: winner.fatG,
          sugarG: winner.sugarG,
          satFatG: winner.satFatG,
          parsed: {
            source: "menuAnalyzer",
            nutrition: {
              sugarG: winner.sugarG,
              fiberG: winner.fiberG,
              satFatG: winner.satFatG,
            },
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to log winner");
      setLogMessage("Winner logged to today.");
    } catch (err: any) {
      setLogMessage(String(err?.message ?? err));
    }
  }

  async function generateMealPlan() {
    if (!plannerPrompt.trim()) return;
    setPlannerLoading(true);
    setPlannerError(null);
    try {
      const res = await fetch("/api/menu/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: plannerPrompt,
          days: Number(plannerDays),
          mealTypes: plannerMeals,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Meal planning failed");
      setPlannerResult(j as MealPlanResponse);
      setOpenRecipes([]);
      setCheckedShoppingItems([]);
    } catch (err: any) {
      setPlannerError(String(err?.message ?? err));
    } finally {
      setPlannerLoading(false);
    }
  }

  function exportPlannerPdf() {
    if (!plannerResult || typeof window === "undefined") return;
    const html = `
      <html>
        <head>
          <title>Meal Plan</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1, h2, h3 { margin: 0 0 12px; }
            .day { margin: 20px 0; padding: 16px; border: 1px solid #ddd; border-radius: 12px; }
            .meal { margin: 10px 0 14px; }
            ul { margin: 8px 0 0 18px; }
          </style>
        </head>
        <body>
          <h1>${plannerResult.planName}</h1>
          <p>${plannerResult.summary}</p>
          ${plannerResult.days
            .map(
              (day) => `
                <div class="day">
                  <h2>${day.dayLabel}</h2>
                  ${day.meals
                    .map(
                      (meal) => `
                        <div class="meal">
                          <h3>${meal.mealType}: ${meal.title}</h3>
                          <p>${meal.description}</p>
                          <p>Calories: ${formatNum(meal.calories, " kcal")}</p>
                          <p>Servings: ${meal.servings ?? "—"} • Prep: ${meal.prepMinutes ?? "—"} min • Cook: ${meal.cookMinutes ?? "—"} min</p>
                          <h4>Ingredients</h4>
                          <ul>${meal.ingredients.map((ingredient) => `<li>${ingredient.amount} ${ingredient.item}</li>`).join("")}</ul>
                          <h4>Instructions</h4>
                          <ol>${meal.instructions.map((step) => `<li>${step}</li>`).join("")}</ol>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
            )
            .join("")}
          <h2>Grocery List</h2>
          ${plannerResult.groceryList
            .map(
              (section) => `
                <h3>${section.category}</h3>
                <ul>${section.items.map((item) => `<li>${item}</li>`).join("")}</ul>
              `
            )
            .join("")}
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function clearPlanner() {
    setPlannerPrompt("");
    setPlannerDays("3");
    setPlannerMeals(["Breakfast", "Lunch", "Dinner"]);
    setPlannerError(null);
    setPlannerResult(null);
    setOpenRecipes([]);
    setCheckedShoppingItems([]);
  }

  async function saveFavoriteMeal(meal: PlannedMeal) {
    const id = `${meal.mealType}-${meal.title}`;
    setSavingMealId(id);
    setSavedMealsError(null);
    try {
      const res = await fetch("/api/menu/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meal.title,
          mealType: meal.mealType,
          description: meal.description,
          calories: meal.calories,
          recipe: {
            recipeTitle: meal.recipeTitle,
            servings: meal.servings,
            prepMinutes: meal.prepMinutes,
            cookMinutes: meal.cookMinutes,
            ingredients: meal.ingredients,
            instructions: meal.instructions,
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to save meal");
      setSavedMeals((current) => [j.meal as SavedMeal, ...current]);
    } catch (err: any) {
      setSavedMealsError(String(err?.message ?? err));
    } finally {
      setSavingMealId(null);
    }
  }

  async function deleteSavedMeal(id: string) {
    setSavedMealsError(null);
    try {
      const res = await fetch(`/api/menu/favorites?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to delete meal");
      setSavedMeals((current) => current.filter((meal) => meal.id !== id));
    } catch (err: any) {
      setSavedMealsError(String(err?.message ?? err));
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.h1}>Menu Analyzer</h1>
        <div className={styles.sub}>
          Compare meals before you order and build plan-aware meal ideas.
        </div>
      </div>

      <section className={`${styles.card} ${styles.compareCard}`}>
        <div className={styles.compareHero}>
          <h2 className={styles.compareTitle}>Compare Meals</h2>
          <div className={styles.compareSubtitle}>
            Pick the option that fits your plan &amp; goals, or see how a meal fits your plan.
          </div>
        </div>

        <div className={styles.compareTabs}>
          <button
            type="button"
            className={`${styles.compareTab} ${compareMode === "quick" ? styles.compareTabActive : ""}`}
            onClick={() => setCompareMode("quick")}
          >
            Quick
          </button>
          <button
            type="button"
            className={`${styles.compareTab} ${compareMode === "restaurant" ? styles.compareTabActive : ""}`}
            onClick={() => setCompareMode("restaurant")}
          >
            Restaurant
          </button>
          <button
            type="button"
            className={`${styles.compareTab} ${compareMode === "barcode" ? styles.compareTabActive : ""}`}
            onClick={() => setCompareMode("barcode")}
          >
            Barcode
          </button>
        </div>

        <div className={styles.searchBar}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            placeholder={
              compareMode === "restaurant"
                ? "Where are you? (e.g. Taco Bell)"
                : compareMode === "barcode"
                ? "Store or product context (optional)"
                : "Where are you? (optional)"
            }
            value={restaurant}
            onChange={(e) => setRestaurant(e.target.value)}
          />
          <span className={styles.chevron}>⌄</span>
        </div>

        <div className={styles.abShell}>
          <div className={styles.optionPanel}>
            <div className={styles.optionLabel}>Option A</div>
            {compareUsesImages ? (
              <>
                <label className={styles.uploadTile}>
                  {optionAPreview ? (
                    <img src={optionAPreview} alt="Option A upload" className={styles.uploadPreview} />
                  ) : (
                    <div className={styles.uploadEmpty}>
                      <span className={styles.uploadPlus}>+</span>
                      <span className={styles.uploadText}>
                        Upload {compareMode === "barcode" ? "product" : "meal"} image
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      void setImagePreview("a", e.target.files?.[0] ?? null);
                    }}
                  />
                </label>
                <div className={styles.uploadCaption}>
                  {optionAScanning
                    ? "Scanning image..."
                    : optionAScan?.title || "AI name will appear here"}
                </div>
              </>
            ) : (
              <>
                <input
                  className={styles.choiceInput}
                  placeholder="#1 Crunchwrap Supreme Combo"
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.detailToggle}
                  onClick={() => setShowADetails((v) => !v)}
                >
                  + Add Details
                </button>
                {showADetails ? (
                  <textarea
                    className={styles.detailInput}
                    placeholder="Combo details, sides, drink, sauces, or portion notes"
                    value={optionADetails}
                    onChange={(e) => setOptionADetails(e.target.value)}
                  />
                ) : null}
              </>
            )}
          </div>
          <div className={styles.vs}>{compareUsesImages && (!optionAImage || !optionBImage) ? "OR" : "VS"}</div>
          <div className={styles.optionPanel}>
            <div className={styles.optionLabel}>Option B</div>
            {compareUsesImages ? (
              <>
                <label className={styles.uploadTile}>
                  {optionBPreview ? (
                    <img src={optionBPreview} alt="Option B upload" className={styles.uploadPreview} />
                  ) : (
                    <div className={styles.uploadEmpty}>
                      <span className={styles.uploadPlus}>+</span>
                      <span className={styles.uploadText}>
                        Upload {compareMode === "barcode" ? "product" : "meal"} image
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      void setImagePreview("b", e.target.files?.[0] ?? null);
                    }}
                  />
                </label>
                <div className={styles.uploadCaption}>
                  {optionBScanning
                    ? "Scanning image..."
                    : optionBScan?.title || "AI name will appear here"}
                </div>
              </>
            ) : (
              <>
                <input
                  className={styles.choiceInput}
                  placeholder="#2 Chicken Quesadilla Combo"
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.detailToggle}
                  onClick={() => setShowBDetails((v) => !v)}
                >
                  + Add Details
                </button>
                {showBDetails ? (
                  <textarea
                    className={styles.detailInput}
                    placeholder="Combo details, sides, drink, sauces, or portion notes"
                    value={optionBDetails}
                    onChange={(e) => setOptionBDetails(e.target.value)}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className={styles.compareActions}>
          <button
            className={`${styles.btn} ${styles.darkBtn}`}
            onClick={() => {
              const a = optionA;
              const aDetails = optionADetails;
              setOptionA(optionB);
              setOptionADetails(optionBDetails);
              setOptionB(a);
              setOptionBDetails(aDetails);
            }}
          >
            Swap A/B
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.compareBtn}`}
            onClick={analyzeCompare}
            disabled={
              compareLoading ||
              (compareUsesImages ? !optionAImage && !optionBImage : !optionA.trim() || !optionB.trim())
            }
          >
            {compareLoading ? "Analyzing..." : compareUsesImages ? "Analyze Meal" : "Compare"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.clearBtn}`}
            onClick={clearCompare}
            disabled={compareLoading}
          >
            Clear
          </button>
        </div>

        {compareError ? <div className={styles.errorText}>{compareError}</div> : null}

        {winner ? (
          <div className={styles.resultBlock}>
            <div className={styles.winnerRow}>
              <div className={styles.winnerBadge}>✓</div>
              <div>
                <div className={styles.winnerText}>
                  {isSingleImageAnalysis ? (
                    <>
                      Meal Fit: <span>{winner.name}</span>
                    </>
                  ) : (
                    <>
                      Winner: {winner.optionIndex === 0 ? "Option A" : "Option B"} - <span>{winner.name}</span>
                    </>
                  )}
                </div>
                <div className={styles.winnerScore}>
                  {isSingleImageAnalysis
                    ? `Plan fit score: ${winner.fitScore}%`
                    : `Score: ${comparedA?.fitScore ?? "—"} vs ${comparedB?.fitScore ?? "—"}`}
                </div>
              </div>
            </div>

            <ul className={styles.winnerReasons}>
              {(isSingleImageAnalysis ? winner.reasons : winnerBullets).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>

            {isSingleImageAnalysis ? (
              <div className={styles.singleMealStats}>
                <div className={styles.singleStat}>
                  <span>Calories</span>
                  <strong>{formatNum(winner.calories, " kcal")}</strong>
                </div>
                <div className={styles.singleStat}>
                  <span>Protein</span>
                  <strong>{formatNum(winner.proteinG, "g")}</strong>
                </div>
                <div className={styles.singleStat}>
                  <span>Carbs</span>
                  <strong>{formatNum(winner.carbsG, "g")}</strong>
                </div>
                <div className={styles.singleStat}>
                  <span>Fat</span>
                  <strong>{formatNum(winner.fatG, "g")}</strong>
                </div>
              </div>
            ) : (
              <div className={styles.compareTable}>
                <div className={styles.tableHead} />
                <div className={styles.tableHead}>Option A</div>
                <div className={styles.tableHead}>Option B</div>

                <div className={styles.tableLabel}>Calories:</div>
                <div className={styles.tableValue}>{formatNum(comparedA?.calories, " kcal")}</div>
                <div className={styles.tableValue}>{formatNum(comparedB?.calories, " kcal")}</div>

                <div className={styles.tableLabel}>Protein:</div>
                <div className={styles.tableValue}>{formatNum(comparedA?.proteinG, "g")}</div>
                <div className={styles.tableValue}>{formatNum(comparedB?.proteinG, "g")}</div>

                <div className={styles.tableLabel}>Carbs:</div>
                <div className={styles.tableValue}>{formatNum(comparedA?.carbsG, "g")}</div>
                <div className={styles.tableValue}>{formatNum(comparedB?.carbsG, "g")}</div>

                <div className={styles.tableLabel}>Fat:</div>
                <div className={styles.tableValue}>{formatNum(comparedA?.fatG, "g")}</div>
                <div className={styles.tableValue}>{formatNum(comparedB?.fatG, "g")}</div>
              </div>
            )}

            <div className={styles.resultFooter}>
              <div className={styles.tipLine}>
                Tip:{" "}
                {winner.summary ||
                  (isSingleImageAnalysis
                    ? "Use this score to judge how closely the meal supports your current plan."
                    : "Choose the option with the stronger fit score and cleaner macro balance.")}
              </div>
              <button className={`${styles.btn} ${styles.logBtn}`} onClick={logWinner}>
                Log Winner
              </button>
            </div>
            {logMessage ? <div className={styles.muted}>{logMessage}</div> : null}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>Smart Meal Planner</div>
            <div className={styles.cardMeta}>
              Tell the planner what you want to eat and it will build breakfasts, lunches, or dinners that fit {plan?.name ?? "your active plan"}.
            </div>
          </div>
        </div>

        <div className={styles.planBanner}>
          Plan: <strong>{plan?.name ?? "No active plan"}</strong>
          {" • "}
          Goal: <strong>{me?.dailyCalorieGoal ?? "—"} kcal</strong>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>What should the planner make?</label>
          <textarea
            className={styles.textarea}
            placeholder="Example: I want three high-protein breakfasts and simple Mediterranean dinners that my kids will eat. Keep prep under 25 minutes and use overlapping ingredients."
            value={plannerPrompt}
            onChange={(e) => setPlannerPrompt(e.target.value)}
          />
        </div>

        <div className={styles.plannerControls}>
          <label className={styles.field}>
            <span className={styles.label}>Days</span>
            <select className={styles.input} value={plannerDays} onChange={(e) => setPlannerDays(e.target.value)}>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7">7 days</option>
            </select>
          </label>
          <div className={styles.field}>
            <span className={styles.label}>Meals to include</span>
            <div className={styles.toggleRow}>
              {["Breakfast", "Lunch", "Dinner"].map((meal) => (
                <button
                  key={meal}
                  type="button"
                  className={`${styles.togglePill} ${plannerMeals.includes(meal) ? styles.togglePillActive : ""}`}
                  onClick={() => togglePlannerMeal(meal)}
                >
                  {meal}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={generateMealPlan}
            disabled={plannerLoading || !plannerPrompt.trim() || !plannerMeals.length}
          >
            {plannerLoading ? "Planning..." : "Build Meal Plan"}
          </button>
          <button type="button" className={`${styles.btn} ${styles.darkBtn}`} onClick={clearPlanner} disabled={plannerLoading}>
            Clear
          </button>
          {plannerResult ? (
            <button type="button" className={`${styles.btn} ${styles.logBtn}`} onClick={exportPlannerPdf}>
              Export PDF
            </button>
          ) : null}
        </div>
        {plannerError ? <div className={styles.errorText}>{plannerError}</div> : null}
        {plannerResult ? (
          <div className={styles.plannerResult}>
            <div className={styles.plannerSummary}>{plannerResult.summary}</div>
            <div className={styles.plannerDayGrid}>
              {plannerResult.days.map((day) => (
                <article key={day.dayLabel} className={styles.dayCard}>
                  <div className={styles.dayTitle}>{day.dayLabel}</div>
                  <div className={styles.dayMeals}>
                    {day.meals.map((meal) => (
                      <div key={`${day.dayLabel}-${meal.mealType}-${meal.title}`} className={styles.mealCard}>
                        <div className={styles.optionHead}>
                          <div className={styles.name}>{meal.mealType}: {meal.title}</div>
                          <div className={styles.score}>{formatNum(meal.calories, " kcal")}</div>
                        </div>
                        <div className={styles.meta}>{meal.description}</div>
                        <div className={styles.recipeMeta}>
                          <span>Serves {meal.servings ?? "—"}</span>
                          <span>Prep {meal.prepMinutes ?? "—"} min</span>
                          <span>Cook {meal.cookMinutes ?? "—"} min</span>
                        </div>
                        <button
                          type="button"
                          className={styles.recipeLink}
                          onClick={() => toggleRecipe(`${day.dayLabel}-${meal.mealType}-${meal.title}`)}
                        >
                          {openRecipes.includes(`${day.dayLabel}-${meal.mealType}-${meal.title}`) ? "Hide Recipe" : "Recipe"}
                        </button>
                        <button
                          type="button"
                          className={styles.archiveBtn}
                          onClick={() => saveFavoriteMeal(meal)}
                          disabled={savingMealId === `${meal.mealType}-${meal.title}`}
                        >
                          {savingMealId === `${meal.mealType}-${meal.title}` ? "Saving..." : "Save"}
                        </button>
                        {openRecipes.includes(`${day.dayLabel}-${meal.mealType}-${meal.title}`) ? (
                          <div className={styles.recipePanel}>
                            <div className={styles.recipeSectionTitle}>Ingredients</div>
                            <ul className={styles.recipeList}>
                              {meal.ingredients.map((ingredient) => (
                                <li key={`${meal.title}-${ingredient.item}-${ingredient.amount}`}>
                                  {ingredient.amount} {ingredient.item}
                                </li>
                              ))}
                            </ul>
                            <div className={styles.recipeSectionTitle}>Instructions</div>
                            <ol className={styles.recipeList}>
                              {meal.instructions.map((step, index) => (
                                <li key={`${meal.title}-step-${index}`}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.plannerBottomGrid}>
              <div className={styles.shoppingCard}>
                <div className={styles.shoppingHead}>
                  <div className={styles.cardTitle}>Grocery List</div>
                  <button
                    type="button"
                    className={styles.archiveBtn}
                    onClick={() => setShoppingMode((v) => !v)}
                  >
                    {shoppingMode ? "Exit Shopping Mode" : "Shopping Mode"}
                  </button>
                </div>
                <div className={styles.shoppingSections}>
                  {plannerResult.groceryList.map((section) => (
                    <div key={section.category} className={styles.shoppingSection}>
                      <div className={styles.shoppingHeading}>{section.category}</div>
                      <ul className={styles.shoppingList}>
                        {section.items.map((item) => (
                          <li key={`${section.category}-${item}`} className={styles.shoppingItem}>
                            {shoppingMode ? (
                              <label className={styles.shoppingCheck}>
                                <input
                                  type="checkbox"
                                  checked={checkedShoppingItems.includes(`${section.category}-${item}`)}
                                  onChange={() => toggleShoppingItem(`${section.category}-${item}`)}
                                />
                                <span
                                  className={
                                    checkedShoppingItems.includes(`${section.category}-${item}`)
                                      ? styles.shoppingChecked
                                      : ""
                                  }
                                >
                                  {item}
                                </span>
                              </label>
                            ) : (
                              item
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.shoppingCard}>
                <div className={styles.cardTitle}>Prep Notes</div>
                <ul className={styles.shoppingList}>
                  {plannerResult.prepTips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
        {savedMealsError ? <div className={styles.errorText}>{savedMealsError}</div> : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>Saved Meal Archive</div>
            <div className={styles.cardMeta}>
              Keep favorite planned meals here so you can reuse them later.
            </div>
          </div>
        </div>

        {savedMeals.length ? (
          <div className={styles.archiveGrid}>
            {savedMeals.map((meal) => (
              <article key={meal.id} className={styles.dayCard}>
                <div className={styles.optionHead}>
                  <div className={styles.name}>
                    {meal.mealType ? `${meal.mealType}: ` : ""}
                    {meal.title}
                  </div>
                  <div className={styles.score}>{formatNum(meal.calories, " kcal")}</div>
                </div>
                <div className={styles.meta}>{meal.description ?? "Saved recipe"}</div>
                <div className={styles.recipeMeta}>
                  <span>Serves {meal.recipe.servings ?? "—"}</span>
                  <span>Prep {meal.recipe.prepMinutes ?? "—"} min</span>
                  <span>Cook {meal.recipe.cookMinutes ?? "—"} min</span>
                </div>
                <div className={styles.archiveActions}>
                  <button
                    type="button"
                    className={styles.recipeLink}
                    onClick={() => toggleRecipe(`saved-${meal.id}`)}
                  >
                    {openRecipes.includes(`saved-${meal.id}`) ? "Hide Recipe" : "Recipe"}
                  </button>
                  <button
                    type="button"
                    className={styles.archiveBtn}
                    onClick={() => deleteSavedMeal(meal.id)}
                  >
                    Delete
                  </button>
                </div>
                {openRecipes.includes(`saved-${meal.id}`) ? (
                  <div className={styles.recipePanel}>
                    <div className={styles.recipeSectionTitle}>Ingredients</div>
                    <ul className={styles.recipeList}>
                      {meal.recipe.ingredients.map((ingredient) => (
                        <li key={`${meal.id}-${ingredient.item}-${ingredient.amount}`}>
                          {ingredient.amount} {ingredient.item}
                        </li>
                      ))}
                    </ul>
                    <div className={styles.recipeSectionTitle}>Instructions</div>
                    <ol className={styles.recipeList}>
                      {meal.recipe.instructions.map((step, index) => (
                        <li key={`${meal.id}-step-${index}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.plannerSummary}>No saved meals yet. Save any planned meal to build your archive.</div>
        )}
      </section>
    </main>
  );
}
