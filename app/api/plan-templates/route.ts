import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverError } from "@/lib/api";

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
  } catch (err) {
    return serverError("Failed to load plan templates", err);
  }
}
