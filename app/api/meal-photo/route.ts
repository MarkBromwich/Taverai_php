import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const COOKIE_NAME = "foodapp_session";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/**
 * Convert YYYY-MM-DD to a safe Date INSIDE that day (midday UTC)
 * Avoids DST/timezone edge cases.
 */
function createdAtFromYMD(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T12:00:00.000Z`);
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const ymd = String(form.get("date") ?? "").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // --- Save file locally (dev) into /public/uploads ---
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const extFromName = path.extname(file.name || "").slice(0, 12);
    const ext =
      extFromName ||
      (file.type === "image/jpeg" ? ".jpg" :
        file.type === "image/png" ? ".png" :
        file.type === "image/webp" ? ".webp" : "");

    const id = crypto.randomBytes(12).toString("hex");
    const filename = `meal_${Date.now()}_${id}${ext || ""}`;
    const absPath = path.join(uploadsDir, filename);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(absPath, Buffer.from(arrayBuffer));

    const publicUrl = `/uploads/${filename}`;

    // --- Create a FoodEntry that references the photo ---
    const createdAt = ymd ? createdAtFromYMD(ymd) : null;

    const entry = await prisma.foodEntry.create({
      data: {
        userId,
        text: "Meal photo",
        ...(createdAt ? { createdAt } : {}),
        parsed: {
          source: "photo",
          imageUrl: publicUrl,
          originalName: file.name ?? null,
          mime: file.type ?? null,
          size: (file as any).size ?? null,
        },
      },
      include: { scores: { include: { plan: true } } },
    });

    return NextResponse.json({ entry, imageUrl: publicUrl });
  } catch (err: any) {
    console.error("Meal photo POST crashed:", err);
    return NextResponse.json(
      { error: "Meal photo POST crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}