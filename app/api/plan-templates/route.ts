import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const templates = await prisma.planTemplate.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        category: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to load plan templates",
        detail: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}