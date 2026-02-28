import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const [entryCount, planCount] = await Promise.all([
      prisma.foodEntry.count({ where: { userId } }),
      prisma.userPlan.count({ where: { userId } }),
    ]);

    let savedMealCount = 0;
    try {
      savedMealCount = await prisma.savedMeal.count({ where: { userId } });
    } catch {
      savedMealCount = 0;
    }

    return NextResponse.json({
      summary: {
        entryCount,
        planCount,
        savedMealCount,
      },
    });
  } catch (err) {
    return serverError("Summary load failed", err);
  }
}
