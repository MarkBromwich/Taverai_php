import { NextResponse } from "next/server";
import OpenAI from "openai";

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 }
      );
    }

    // Convert image to base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a nutrition estimation AI.
Return ONLY valid JSON.
Estimate realistic calories and macros for the entire plate.
Be conservative and reasonable.
Do not explain anything.
`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Analyze this meal photo and return JSON:

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
Confidence should be 0–1.
`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.type};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const result: MealScanResult = {
      title: parsed.title ?? "Meal",
      calories: Number(parsed.calories) || null,
      proteinG: Number(parsed.proteinG) || null,
      carbsG: Number(parsed.carbsG) || null,
      fatG: Number(parsed.fatG) || null,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : null,
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