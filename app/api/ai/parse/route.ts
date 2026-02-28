import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFoodText } from "@/lib/ai/parseFood";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const entries = await prisma.foodEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        text: true,
        createdAt: true,
        parsed: true,
      },
    });

    return NextResponse.json({ entries });
  } catch (err) {
    return serverError("Failed to load parsed entries", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const body = await req.json().catch(() => null);
    const text = body?.text;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const cleanedText = text.trim();
    const parsed = await parseFoodText(cleanedText);

    const entry = await prisma.foodEntry.create({
      data: {
        userId,
        text: cleanedText,
        parsed,
      },
      select: {
        id: true,
        text: true,
        createdAt: true,
        parsed: true,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return serverError("Failed to parse food text", err);
  }
}
