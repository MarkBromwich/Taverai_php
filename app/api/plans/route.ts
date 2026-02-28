import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { PlanType } from "@prisma/client";
import { getDietScoringProfileBySlug } from "@/lib/dietScoringProfiles";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const plans = await prisma.userPlan.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, config: true, createdAt: true },
    });

    return NextResponse.json({ plans });
  } catch (err) {
    return serverError("Failed to load plans", err);
  }
}

function pickDietPlanType(): PlanType {
  return (Object.values(PlanType) as string[]).includes("TEMPLATE") ? ("TEMPLATE" as PlanType) : ("MEDITERRANEAN" as PlanType);
}

function validPctRange(min: unknown, max: unknown) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a < 0 || b > 1 || a > b) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => null);
    const templateSlug = body?.templateSlug;

    if (templateSlug && typeof templateSlug === "string") {
      if (templateSlug === "weightwatchers") {
        return NextResponse.json({ error: "That template is disabled." }, { status: 400 });
      }

      const template = await prisma.planTemplate.findUnique({
        where: { slug: templateSlug },
        select: { slug: true, name: true, category: true },
      });

      if (!template) {
        return NextResponse.json({ error: "Unknown templateSlug" }, { status: 400 });
      }

      const plan = await prisma.userPlan.create({
        data: {
          userId,
          type: pickDietPlanType(),
          name: template.name,
          config: {
            templateSlug: template.slug,
            templateCategory: template.category,
            scoringProfile: getDietScoringProfileBySlug(template.slug),
          },
        },
        select: { id: true, name: true, type: true, config: true, createdAt: true },
      });

      return NextResponse.json({ plan }, { status: 201 });
    }

    const type = body?.type;
    const name = body?.name;

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    let config: any = body?.config ?? null;

    if (type === "CALORIE") {
      const t = Number(config?.targetCalories ?? 0);
      if (!Number.isFinite(t) || t <= 0 || t > 20000) {
        return NextResponse.json({ error: "CALORIE requires config.targetCalories between 1 and 20000" }, { status: 400 });
      }
      config = { targetCalories: Math.round(t) };
    } else if (type === "MEDITERRANEAN") {
      config = config ?? {};
      if (config?.scoringProfile) {
        const p = config.scoringProfile;
        if (
          !validPctRange(p?.carbs?.min, p?.carbs?.max) ||
          !validPctRange(p?.fat?.min, p?.fat?.max) ||
          !validPctRange(p?.protein?.min, p?.protein?.max)
        ) {
          return NextResponse.json({ error: "Custom macro ranges must be valid percentages between 0 and 1." }, { status: 400 });
        }
        const penaltyDivisor = Number(p?.penaltyDivisor);
        if (!Number.isFinite(penaltyDivisor) || penaltyDivisor <= 0 || penaltyDivisor > 1) {
          return NextResponse.json({ error: "Custom penalty divisor must be between 0 and 1." }, { status: 400 });
        }
        config = {
          ...config,
          targetCalories: config?.targetCalories == null ? null : Math.round(Number(config.targetCalories)),
          scoringProfile: {
            slug: String(p?.slug ?? "custom"),
            label: String(p?.label ?? name),
            carbs: { min: Number(p.carbs.min), max: Number(p.carbs.max) },
            fat: { min: Number(p.fat.min), max: Number(p.fat.max) },
            protein: { min: Number(p.protein.min), max: Number(p.protein.max) },
            penaltyDivisor,
          },
        };
      }
    } else {
      return NextResponse.json({ error: "Unknown plan type" }, { status: 400 });
    }

    const plan = await prisma.userPlan.create({
      data: { userId, type, name, config },
      select: { id: true, name: true, type: true, config: true, createdAt: true },
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    return serverError("Failed to save plan", err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const plan = await prisma.userPlan.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.userPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("Failed to delete plan", err);
  }
}
