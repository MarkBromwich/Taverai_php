import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const meals = await prisma.savedMeal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ meals });
  } catch (err) {
    return serverError("Failed to load saved meals", err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const recipe = body?.recipe;

    if (!title || !recipe || typeof recipe !== "object") {
      return NextResponse.json({ error: "Title and recipe are required." }, { status: 400 });
    }

    const meal = await prisma.savedMeal.create({
      data: {
        userId,
        title,
        mealType: typeof body?.mealType === "string" ? body.mealType.trim() : null,
        description: typeof body?.description === "string" ? body.description.trim() : null,
        calories: typeof body?.calories === "number" ? body.calories : null,
        recipe,
      },
    });

    return NextResponse.json({ meal });
  } catch (err) {
    return serverError("Failed to save meal", err);
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Meal id is required." }, { status: 400 });

    await prisma.savedMeal.deleteMany({
      where: { id, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("Failed to delete meal", err);
  }
}
