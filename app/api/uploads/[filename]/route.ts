import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getUploadsDir } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function safeFilename(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    const decoded = decodeURIComponent(filename);
    if (!safeFilename(decoded)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    const ext = path.extname(decoded).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const candidates = [
      path.join(getUploadsDir(), decoded),
      path.join(process.cwd(), "public", "uploads", decoded),
    ];

    for (const filePath of candidates) {
      try {
        const buffer = await fs.readFile(filePath);
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        // Try next candidate.
      }
    }

    return NextResponse.json({ error: "File not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
