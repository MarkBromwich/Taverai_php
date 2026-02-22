import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // IMPORTANT on Render
export const dynamic = "force-dynamic";

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

function numOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const formData = await req.formData();
    const imagePart = formData.get("image");

    // Accept File OR Blob (some clients/runtimes give Blob)
    if (!imagePart || typeof (imagePart as any).arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "Image file is required (field name: image)" },
        { status: 400 }
      );
    }

    const blob = imagePart as Blob;
    const mime = (blob as any).type || "image/jpeg";

    // Convert image to base64
    const buffer = Buffer.from(await blob.arrayBuffer());
    const base64 = buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a nutrition estimation AI. Return ONLY valid JSON. Estimate realistic calories and macros for the entire plate. Be conservative and reasonable. Do not explain anything.",
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
  "items": [
    { "name": string, "confidence": number }
  ]
}

Make the title descriptive but concise.
Return totals for the entire meal.
Confidence should be 0–1.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
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

    const result: MealScanResult = {
      title: parsed.title ?? "Meal",
      calories: numOrNull(parsed.calories),
      proteinG: numOrNull(parsed.proteinG),
      carbsG: numOrNull(parsed.carbsG),
      fatG: numOrNull(parsed.fatG),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      notes: parsed.notes ?? null,
      source: "mealPhoto",
      items: Array.isArray(parsed.items) ? parsed.items : null,
    };

    return NextResponse.json({ result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Meal scan failed" },
      { status: 500 }
    );
  }
}