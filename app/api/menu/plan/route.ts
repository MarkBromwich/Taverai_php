import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/session";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { serverError, tooManyRequestsJson, unauthorizedJson } from "@/lib/api";

const PLANNER_RULE = { limit: 12, windowMs: 10 * 60 * 1000 };

function safeNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanText(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeCategory(v: any) {
  const x = cleanText(v).toLowerCase();
  if (["produce", "vegetables", "fruit"].includes(x)) return "Produce";
  if (["protein", "meat", "seafood"].includes(x)) return "Protein";
  if (["dairy", "eggs"].includes(x)) return "Dairy & Eggs";
  if (["grains", "bread", "pasta"].includes(x)) return "Grains & Bakery";
  if (["pantry", "spices", "condiments"].includes(x)) return "Pantry";
  if (["frozen"].includes(x)) return "Frozen";
  return cleanText(v) || "Other";
}

function deriveGroceryList(days: Array<{ meals: Array<{ ingredients: Array<{ item: string; amount: string; category: string }> }> }>) {
  const byCategory = new Map<string, Set<string>>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const ingredient of meal.ingredients) {
        const category = normalizeCategory(ingredient.category);
        const label = [cleanText(ingredient.amount), cleanText(ingredient.item)].filter(Boolean).join(" ");
        if (!label) continue;
        if (!byCategory.has(category)) byCategory.set(category, new Set());
        byCategory.get(category)!.add(label);
      }
    }
  }
  return Array.from(byCategory.entries()).map(([category, items]) => ({
    category,
    items: Array.from(items.values()),
  }));
}

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("menu-plan", [userId, ip]), PLANNER_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Meal planner limit reached. Try again later.");
    }

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const mealTypes = Array.isArray(body?.mealTypes)
      ? body.mealTypes.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 6)
      : [];
    const daysRaw = Number(body?.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(7, Math.round(daysRaw))) : 3;

    if (!prompt) return NextResponse.json({ error: "Planner prompt is required." }, { status: 400 });
    if (!mealTypes.length) return NextResponse.json({ error: "Select at least one meal type." }, { status: 400 });

    const plan = await prisma.userPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { name: true, type: true, config: true },
    });

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyCalorieGoal: true },
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";

    const system = [
      "You are a meal planning assistant.",
      "Create practical meals that fit the user's diet plan, calorie goal, and stated preferences.",
      "Return strict JSON only.",
      "Each meal must include a complete, practical recipe.",
      "Return ingredients with amounts, step-by-step instructions, servings, prep time, cook time, and estimated calories.",
      "Use overlapping ingredients where reasonable to keep shopping practical.",
    ].join(" ");

    const userPrompt = [
      "Build a meal plan with this JSON shape:",
      "{",
      '  "planName": string,',
      '  "summary": string,',
      '  "days": [',
      "    {",
      '      "dayLabel": string,',
      '      "meals": [',
      "        {",
      '          "mealType": string,',
      '          "title": string,',
      '          "description": string,',
      '          "calories": number,',
      '          "servings": number,',
      '          "prepMinutes": number,',
      '          "cookMinutes": number,',
      '          "ingredients": [',
      "            {",
      '              "item": string,',
      '              "amount": string,',
      '              "category": string',
      "            }",
      "          ],",
      '          "instructions": string[]',
      "        }",
      "      ]",
      "    }",
      "  ],",
      '  "prepTips": string[]',
      "}",
      "",
      `Diet plan: ${plan?.name ?? "No active plan"}`,
      `Plan type: ${plan?.type ?? "unknown"}`,
      `Daily calorie goal: ${me?.dailyCalorieGoal ?? "not set"}`,
      `Days: ${days}`,
      `Meal types: ${mealTypes.join(", ")}`,
      `User request: ${prompt}`,
    ].join("\n");

    const ai = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = ai.choices[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const normalizedDays = Array.isArray(parsed?.days)
      ? parsed.days.slice(0, days).map((day: any, dayIndex: number) => ({
          dayLabel: typeof day?.dayLabel === "string" && day.dayLabel.trim() ? day.dayLabel.trim() : `Day ${dayIndex + 1}`,
          meals: Array.isArray(day?.meals)
            ? day.meals
                .map((meal: any) => {
                  const title = typeof meal?.title === "string" ? meal.title.trim() : "";
                  const recipeTitle = typeof meal?.recipeTitle === "string" && meal.recipeTitle.trim() ? meal.recipeTitle.trim() : title;
                  if (!title) return null;
                  return {
                    mealType: typeof meal?.mealType === "string" && meal.mealType.trim() ? meal.mealType.trim() : "Meal",
                    title,
                    description:
                      typeof meal?.description === "string" && meal.description.trim()
                        ? meal.description.trim()
                        : "Plan-friendly meal.",
                    calories: safeNum(meal?.calories),
                    recipeTitle,
                    servings: safeNum(meal?.servings),
                    prepMinutes: safeNum(meal?.prepMinutes),
                    cookMinutes: safeNum(meal?.cookMinutes),
                    ingredients: Array.isArray(meal?.ingredients)
                      ? meal.ingredients
                          .map((ingredient: any) => {
                            const item = cleanText(ingredient?.item);
                            if (!item) return null;
                            return {
                              item,
                              amount: cleanText(ingredient?.amount) || "to taste",
                              category: normalizeCategory(ingredient?.category),
                            };
                          })
                          .filter(Boolean)
                      : [],
                    instructions: Array.isArray(meal?.instructions)
                      ? meal.instructions.map((x: any) => cleanText(x)).filter(Boolean)
                      : [],
                  };
                })
                .filter(Boolean)
            : [],
        }))
      : [];

    const prepTips = Array.isArray(parsed?.prepTips)
      ? parsed.prepTips.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 8)
      : [];

    return NextResponse.json({
      planName:
        typeof parsed?.planName === "string" && parsed.planName.trim()
          ? parsed.planName.trim()
          : `${plan?.name ?? "Custom"} Smart Meal Planner`,
      summary:
        typeof parsed?.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "A plan built around your selected diet approach and meal preferences.",
      days: normalizedDays,
      groceryList: deriveGroceryList(normalizedDays as any),
      prepTips,
    });
  } catch (err) {
    return serverError("Meal planning failed", err);
  }
}
