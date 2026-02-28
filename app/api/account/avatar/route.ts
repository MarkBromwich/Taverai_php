import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";
import { validateImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return unauthorizedJson();

    const form = await req.formData();
    const validated = await validateImageUpload(form.get("file"), { fieldLabel: "image", maxBytes: 4 * 1024 * 1024 });
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const id = crypto.randomBytes(12).toString("hex");
    const filename = `avatar_${Date.now()}_${id}${validated.ext}`;
    const absPath = path.join(uploadsDir, filename);
    await fs.writeFile(absPath, validated.buffer);

    const publicUrl = `/uploads/${filename}`;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicUrl },
      select: { avatarUrl: true },
    });

    return NextResponse.json({ avatarUrl: updated.avatarUrl });
  } catch (err) {
    return serverError("Avatar upload failed", err);
  }
}
