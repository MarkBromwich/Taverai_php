import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserIdFromRequest } from "@/lib/session";
import { checkRateLimit, getRequestIp, makeRateLimitKey } from "@/lib/rateLimit";
import { serverError, tooManyRequestsJson, unauthorizedJson } from "@/lib/api";
import { validateImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_RULE = { limit: 25, windowMs: 10 * 60 * 1000 };

function numOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type FoodGroup = "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other";

function normalizeFoodGroup(v: any): FoodGroup {
  const x = String(v ?? "").toLowerCase().trim();
  if (["fruit", "fruits"].includes(x)) return "fruit";
  if (["vegetable", "vegetables", "veg", "veggies"].includes(x)) return "vegetable";
  if (["grain", "grains", "whole_grain", "whole grain"].includes(x)) return "grain";
  if (["protein", "meat", "fish", "egg", "eggs", "legume", "legumes", "beans"].includes(x)) return "protein";
  if (["dairy", "milk", "cheese", "yogurt", "yoghurt"].includes(x)) return "dairy";
  return "other";
}

function normalizeParsedItems(items: any) {
  if (!Array.isArray(items)) return null;

  const out = items
    .map((it: any) => {
      const name = typeof it?.name === "string" ? it.name.trim() : "";
      if (!name) return null;
      const tags = Array.isArray(it?.tags)
        ? it.tags
            .filter((t: any) => typeof t === "string")
            .map((t: string) => t.toLowerCase().trim())
            .filter(Boolean)
        : [];
      return {
        name,
        confidence: numOrNull(it?.confidence),
        servings: numOrNull(it?.servings),
        foodGroup: normalizeFoodGroup(it?.foodGroup),
        calories: numOrNull(it?.calories),
        sugarG: numOrNull(it?.sugarG),
        addedSugarG: numOrNull(it?.addedSugarG),
        fiberG: numOrNull(it?.fiberG),
        satFatG: numOrNull(it?.satFatG),
        sodiumMg: numOrNull(it?.sodiumMg),
        tags,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return out.length ? out : null;
}

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const ip = getRequestIp(req);
    const attempt = await checkRateLimit(makeRateLimitKey("meal-scan", [userId, ip]), SCAN_RULE);
    if (!attempt.ok) {
      return tooManyRequestsJson(attempt.retryAfterMs, "Meal scan limit reached. Try again shortly.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Meal scan is not configured." }, { status: 500 });
    }

    const formData = await req.formData();
    const validated = await validateImageUpload(formData.get("image"), {
      fieldLabel: "image",
      maxBytes: 6 * 1024 * 1024,
    });
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const model = process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a nutrition estimation AI. Return ONLY valid JSON. Estimate realistic calories/macros and item-level nutrition for the entire plate. Be conservative and reasonable. Do not explain anything.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this meal photo and return JSON:\n\n{\n  "title": string,\n  "calories": number,\n  "proteinG": number,\n  "carbsG": number,\n  "fatG": number,\n  "sugarG": number,\n  "fiberG": number,\n  "satFatG": number,\n  "confidence": number,\n  "notes": string,\n  "items": [\n    {\n      "name": string,\n      "confidence": number,\n      "servings": number,\n      "foodGroup": "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other",\n      "calories": number,\n      "sugarG": number,\n      "addedSugarG": number,\n      "fiberG": number,\n      "satFatG": number,\n      "sodiumMg": number,\n      "tags": string[]\n    }\n  ]\n}\n\nReturn totals for the entire meal. Confidence is 0–1.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${validated.mime};base64,${validated.buffer.toString("base64")}` },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      result: {
        title: parsed.title ?? "Meal",
        calories: numOrNull(parsed.calories),
        proteinG: numOrNull(parsed.proteinG),
        carbsG: numOrNull(parsed.carbsG),
        fatG: numOrNull(parsed.fatG),
        sugarG: numOrNull(parsed.sugarG),
        fiberG: numOrNull(parsed.fiberG),
        satFatG: numOrNull(parsed.satFatG),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        notes: parsed.notes ?? null,
        items: normalizeParsedItems(parsed.items),
        source: "mealPhoto" as const,
      },
    });
  } catch (err) {
    return serverError("Meal scan failed", err);
  }
}
