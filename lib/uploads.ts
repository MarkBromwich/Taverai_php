const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export async function validateImageUpload(
  file: unknown,
  options?: { maxBytes?: number; fieldLabel?: string }
) {
  const maxBytes = options?.maxBytes ?? 4 * 1024 * 1024;
  const fieldLabel = options?.fieldLabel ?? "image";

  if (!file || !(file instanceof File)) {
    return { error: `Missing ${fieldLabel} file` } as const;
  }

  const mime = String(file.type || "").toLowerCase();
  const ext = ALLOWED_IMAGE_TYPES.get(mime);
  if (!ext) {
    return { error: "Only JPG, PNG, and WEBP images are supported." } as const;
  }

  const size = Number((file as File).size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { error: "Uploaded image is empty." } as const;
  }

  if (size > maxBytes) {
    return { error: `Image must be ${Math.round(maxBytes / (1024 * 1024))}MB or smaller.` } as const;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    file,
    mime,
    ext,
    size,
    buffer,
  } as const;
}
