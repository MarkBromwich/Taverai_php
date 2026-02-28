import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickNutriment(nutriments: any, keyServing: string, key100g: string): { value: number | null; basis: "serving" | "100g" | null } {
  const s = num(nutriments?.[keyServing]);
  if (s != null) return { value: s, basis: "serving" };
  const g = num(nutriments?.[key100g]);
  if (g != null) return { value: g, basis: "100g" };
  return { value: null, basis: null };
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => ({}));
    const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
    if (!barcode) return NextResponse.json({ error: "Barcode is required" }, { status: 400 });

    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const offRes = await fetch(url, { cache: "no-store" });
    const offJson: any = await offRes.json().catch(() => ({}));

    if (!offRes.ok || offJson?.status !== 1 || !offJson?.product) {
      return NextResponse.json({ error: "Product not found for that barcode." }, { status: 404 });
    }

    const p = offJson.product;
    const nutr = p?.nutriments ?? {};
    const kcalPick = pickNutriment(nutr, "energy-kcal_serving", "energy-kcal_100g");
    const proteinPick = pickNutriment(nutr, "proteins_serving", "proteins_100g");
    const carbsPick = pickNutriment(nutr, "carbohydrates_serving", "carbohydrates_100g");
    const fatPick = pickNutriment(nutr, "fat_serving", "fat_100g");
    const sugarPick = pickNutriment(nutr, "sugars_serving", "sugars_100g");
    const fiberPick = pickNutriment(nutr, "fiber_serving", "fiber_100g");
    const satFatPick = pickNutriment(nutr, "saturated-fat_serving", "saturated-fat_100g");

    const name =
      (typeof p?.product_name === "string" && p.product_name.trim()) ||
      (typeof p?.generic_name === "string" && p.generic_name.trim()) ||
      `Barcode ${barcode}`;

    return NextResponse.json({
      product: {
        barcode,
        name,
        brand: typeof p?.brands === "string" ? p.brands.trim() : null,
        servingSize: p?.serving_size ?? null,
        basis: {
          calories: kcalPick.basis,
          proteinG: proteinPick.basis,
          carbsG: carbsPick.basis,
          fatG: fatPick.basis,
          sugarG: sugarPick.basis,
          fiberG: fiberPick.basis,
          satFatG: satFatPick.basis,
        },
        calories: kcalPick.value != null ? Math.round(kcalPick.value) : null,
        proteinG: proteinPick.value,
        carbsG: carbsPick.value,
        fatG: fatPick.value,
        sugarG: sugarPick.value,
        fiberG: fiberPick.value,
        satFatG: satFatPick.value,
      },
    });
  } catch (err) {
    return serverError("Grocery lookup failed", err);
  }
}
