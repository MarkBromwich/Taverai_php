import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "foodapp_session";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/**
 * Convert YYYY-MM-DD to a safe Date INSIDE that day (midday UTC)
 * Avoids DST/timezone edge cases.
 */
function createdAtFromYMD(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * OpenFoodFacts returns nutriments often like:
 * - energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g
 * - energy-kcal_serving, proteins_serving, carbohydrates_serving, fat_serving
 *
 * We prefer *_serving if present; else fallback to *_100g.
 */
function pickNutriment(
  nutriments: any,
  keyServing: string,
  key100g: string
): { value: number | null; basis: "serving" | "100g" | null } {
  const s = num(nutriments?.[keyServing]);
  if (s != null) return { value: s, basis: "serving" };

  const g = num(nutriments?.[key100g]);
  if (g != null) return { value: g, basis: "100g" };

  return { value: null, basis: null };
}


export async function POST(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
    const ymd = typeof body?.date === "string" ? body.date.trim() : "";

    if (!barcode) {
      return NextResponse.json({ error: "Barcode is required" }, { status: 400 });
    }

    // OpenFoodFacts lookup (global)
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      barcode
    )}.json`;

    const offRes = await fetch(url, {
      // keep it simple; OFF is public. If you want to be extra polite, add a UA server-side later.
      cache: "no-store",
    });

    const offJson: any = await offRes.json().catch(() => ({}));

    // OFF returns { status: 1 } for found, { status: 0 } for not found
    if (!offRes.ok || offJson?.status !== 1 || !offJson?.product) {
      return NextResponse.json(
        { error: "Product not found for that barcode." },
        { status: 404 }
      );
    }

    const p = offJson.product;
    const nutr = p?.nutriments ?? {};

    const kcalPick = pickNutriment(nutr, "energy-kcal_serving", "energy-kcal_100g");
    const proteinPick = pickNutriment(nutr, "proteins_serving", "proteins_100g");
    const carbsPick = pickNutriment(nutr, "carbohydrates_serving", "carbohydrates_100g");
    const fatPick = pickNutriment(nutr, "fat_serving", "fat_100g");

    // For MVP: store whatever we have. If only 100g data exists, we store "per 100g".
    const calories = kcalPick.value != null ? Math.round(kcalPick.value) : null;
    const proteinG = proteinPick.value;
    const carbsG = carbsPick.value;
    const fatG = fatPick.value;

    const name =
      (typeof p?.product_name === "string" && p.product_name.trim()) ||
      (typeof p?.generic_name === "string" && p.generic_name.trim()) ||
      `Barcode ${barcode}`;

    const brands =
      typeof p?.brands === "string" && p.brands.trim() ? ` (${p.brands.trim()})` : "";

    const text = `${name}${brands}`.slice(0, 280);

    const createdAt = ymd ? createdAtFromYMD(ymd) : null;

    const entry = await prisma.foodEntry.create({
      data: {
        userId,
        text,
        ...(createdAt ? { createdAt } : {}),

        ...(calories != null ? { calories } : {}),
        ...(proteinG != null ? { proteinG } : {}),
        ...(carbsG != null ? { carbsG } : {}),
        ...(fatG != null ? { fatG } : {}),

        // Keep parsed useful for debugging + future improvements
        parsed: {
          source: "openfoodfacts",
          barcode,
          basis: {
            calories: kcalPick.basis,
            proteinG: proteinPick.basis,
            carbsG: carbsPick.basis,
            fatG: fatPick.basis,
          },
          servingSize: p?.serving_size ?? null,
          productQuantity: p?.product_quantity ?? null,
          nutriments: {
            energy_kcal_serving: nutr?.["energy-kcal_serving"] ?? null,
            energy_kcal_100g: nutr?.["energy-kcal_100g"] ?? null,
            proteins_serving: nutr?.proteins_serving ?? null,
            proteins_100g: nutr?.proteins_100g ?? null,
            carbs_serving: nutr?.carbohydrates_serving ?? null,
            carbs_100g: nutr?.carbohydrates_100g ?? null,
            fat_serving: nutr?.fat_serving ?? null,
            fat_100g: nutr?.fat_100g ?? null,
          },
        },
      },
      include: {
        scores: { include: { plan: true } },
      },
    });

    return NextResponse.json({ entry });
  } catch (err: any) {
    console.error("Barcode POST crashed:", err);
    return NextResponse.json(
      { error: "Barcode POST crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}