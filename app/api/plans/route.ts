import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";

const COOKIE_NAME = "foodapp_session";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plans = await prisma.userPlan.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, config: true, createdAt: true },
    });

    return NextResponse.json({ plans });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Plans GET crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
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
        return NextResponse.json(
          { error: "CALORIE requires config.targetCalories between 1 and 20000" },
          { status: 400 }
        );
      }
      config = { targetCalories: Math.round(t) };
    } else if (type === "MEDITERRANEAN") {
      config = config ?? {};
    } else {
      return NextResponse.json({ error: "Unknown plan type" }, { status: 400 });
    }

    const plan = await prisma.userPlan.create({
      data: { userId, type, name, config },
      select: { id: true, name: true, type: true, config: true, createdAt: true },
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Plans POST crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const plan = await prisma.userPlan.findFirst({ where: { id, userId }, select: { id: true } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.userPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Plans DELETE crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
