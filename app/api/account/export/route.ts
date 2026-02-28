import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const [user, preferences, plans, entries, savedMeals] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          paidStatus: true,
          dailyCalorieGoal: true,
          createdAt: true,
        },
      }),
      prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          theme: true,
          units: true,
          healthAppConnected: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.userPlan.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, type: true, config: true, createdAt: true },
      }),
      prisma.foodEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          text: true,
          createdAt: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
          parsed: true,
        },
      }),
      prisma.savedMeal.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          mealType: true,
          description: true,
          calories: true,
          recipe: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      user,
      preferences,
      plans,
      entries,
      savedMeals,
    });
  } catch (err) {
    return serverError("Export failed", err);
  }
}
