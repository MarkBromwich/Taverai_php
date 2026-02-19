import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFoodText } from "@/lib/ai/parseFood";

const COOKIE_NAME = "foodapp_session";

/**
 * GET /api/entries
 * Returns recent food entries for the logged-in user
 */
export async function GET(req: NextRequest) {
  const userId = req.cookies.get(COOKIE_NAME)?.value;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

/**
 * POST /api/entries
 * Saves a food entry AND parses it with AI (mocked for now)
 */
export async function POST(req: NextRequest) {
  const userId = req.cookies.get(COOKIE_NAME)?.value;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text = body?.text;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // 1️⃣ Clean the input
  const cleanedText = text.trim();

  // 2️⃣ Parse food text (mock AI for now)
  const parsed = await parseFoodText(cleanedText);

  // 3️⃣ Save BOTH raw text and parsed JSON
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
}
