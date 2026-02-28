import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";
import { validateImageUpload } from "@/lib/uploads";

function createdAtFromYMD(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const form = await req.formData();
    const ymd = String(form.get("date") ?? "").trim();
    const validated = await validateImageUpload(form.get("file"), { fieldLabel: "meal image", maxBytes: 6 * 1024 * 1024 });
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const id = crypto.randomBytes(12).toString("hex");
    const filename = `meal_${Date.now()}_${id}${validated.ext}`;
    const absPath = path.join(uploadsDir, filename);
    await fs.writeFile(absPath, validated.buffer);

    const publicUrl = `/uploads/${filename}`;
    const createdAt = ymd ? createdAtFromYMD(ymd) : null;

    const entry = await prisma.foodEntry.create({
      data: {
        userId,
        text: "Meal photo",
        ...(createdAt ? { createdAt } : {}),
        parsed: {
          source: "photo",
          imageUrl: publicUrl,
          mime: validated.mime,
          size: validated.size,
        },
      },
      include: { scores: { include: { plan: true } } },
    });

    return NextResponse.json({ entry, imageUrl: publicUrl });
  } catch (err) {
    return serverError("Meal photo upload failed", err);
  }
}
