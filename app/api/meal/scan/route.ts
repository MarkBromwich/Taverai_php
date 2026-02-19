// app/api/meal/scan/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export type MealScanResult = {
  title: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  confidence: number | null;
  notes: string | null;
  source: "mealPhoto";
  items: Array<{ name: string; confidence: number | null }> | null;
};

function toNumOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY (set it in Render Environment Variables)" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    // Convert image to base64 data URL
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a nutrition estimation AI. Return ONLY valid JSON. " +
            "Estimate calories and macros for the entire plate. Be conservative. No explanations.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this meal photo and return JSON:

{
  "title": string,
  "calories": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "confidence": number,
  "notes": string,
  "items": [{ "name": string, "confidence": number }]
}

Title should be descriptive but concise.
Return totals for the entire meal.
Confidence must be 0–1.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
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

    const result: MealScanResult = {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Meal",
      calories: toNumOrNull(parsed.calories),
      proteinG: toNumOrNull(parsed.proteinG),
      carbsG: toNumOrNull(parsed.carbsG),
      fatG: toNumOrNull(parsed.fatG),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
      source: "mealPhoto",
      items: Array.isArray(parsed.items)
        ? parsed.items.map((it: any) => ({
            name: String(it?.name ?? "").trim() || "Item",
            confidence: typeof it?.confidence === "number" ? it.confidence : null,
          }))
        : null,
    };

    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Meal scan failed" }, { status: 500 });
  }
}