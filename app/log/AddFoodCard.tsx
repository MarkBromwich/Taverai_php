"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./log.module.css";

/* -----------------------------
   Types
------------------------------ */

type MealScanResult = {
  title: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  satFatG?: number | null;
  confidence?: number | null;
  notes?: string | null;
  items?: Array<{
    name: string;
    confidence?: number | null;
    servings?: number | null;
    foodGroup?: "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "other";
    calories?: number | null;
    sugarG?: number | null;
    addedSugarG?: number | null;
    fiberG?: number | null;
    satFatG?: number | null;
    sodiumMg?: number | null;
    tags?: string[];
  }> | null;
};

/* -----------------------------
   Helpers
------------------------------ */

function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function scale(n: number | null | undefined, factor: number) {
  if (n == null) return null;
  return Math.round(n * factor);
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawImageToCanvas(file: File, maxSide = 1600): Promise<HTMLCanvasElement | null> {
  try {
    const img = await loadImageElement(file);
    const longestSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1);
    const scaleFactor = Math.min(1, maxSide / longestSide);
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scaleFactor));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scaleFactor));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } catch {
    return null;
  }
}

async function normalizePhotoFile(file: File): Promise<File> {
  const needsNormalization =
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024;
  if (!needsNormalization) return file;

  const canvas = await drawImageToCanvas(file, 1600);
  if (!canvas) return file;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), "image/jpeg", 0.88)
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function detectBarcodeFromFile(file: File): Promise<string | null> {
  const Detector = (globalThis as any).BarcodeDetector;
  if (!Detector || typeof document === "undefined") return null;

  try {
    const detector = new Detector({
      formats: [
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_128",
        "code_39",
        "qr_code",
      ],
    });
    const canvas = await drawImageToCanvas(file, 1400);
    if (!canvas) return null;
    const results = await detector.detect(canvas);
    const raw = results?.[0]?.rawValue;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

/* -----------------------------
   Component
------------------------------ */

export default function AddFoodCard(props: {
  newText: string;
  setNewText: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onBarcode: (barcode: string) => Promise<void> | void;
  onMealPhoto: (file: File) => Promise<MealScanResult>;
  onSaveMealDraft: (draft: MealScanResult) => Promise<void> | void;
}) {
  const {
    newText,
    setNewText,
    submitting,
    onSubmit,
    onBarcode,
    onMealPhoto,
    onSaveMealDraft,
  } = props;

  const canSubmit = newText.trim().length > 0 && !submitting;

  /* -----------------------------
     Meal Photo
  ------------------------------ */

  const [mealFile, setMealFile] = useState<File | null>(null);
  const [mealPreviewUrl, setMealPreviewUrl] = useState<string | null>(null);

  const [mealBase, setMealBase] = useState<MealScanResult | null>(null);
  const [mealDraft, setMealDraft] = useState<MealScanResult | null>(null);

  const [portion, setPortion] = useState(1);

  const [mealLoading, setMealLoading] = useState(false);
  const [mealDraftLoading, setMealDraftLoading] = useState(false);
  const [mealMsg, setMealMsg] = useState<string | null>(null);
  const [mealPickerOpen, setMealPickerOpen] = useState(false);

  const mealCameraRef = useRef<HTMLInputElement | null>(null);
  const mealLibraryRef = useRef<HTMLInputElement | null>(null);

  function clearMeal() {
    if (mealPreviewUrl) URL.revokeObjectURL(mealPreviewUrl);
    setMealFile(null);
    setMealPreviewUrl(null);
    setMealBase(null);
    setMealDraft(null);
    setPortion(1);
    setMealMsg(null);
    setMealPickerOpen(false);
  }

  async function setMealFromFile(f: File) {
    setMealDraftLoading(true);
    setMealMsg(null);
    setMealPickerOpen(false);

    try {
      const preparedFile = await normalizePhotoFile(f);
      const barcode = await detectBarcodeFromFile(preparedFile);
      if (barcode) {
        await onBarcode(barcode);
        clearMeal();
        setMealMsg("Barcode detected and saved ✅");
        return;
      }

      if (mealPreviewUrl) URL.revokeObjectURL(mealPreviewUrl);
      setMealPreviewUrl(URL.createObjectURL(preparedFile));
      setMealFile(preparedFile);

      const result = await onMealPhoto(preparedFile);
      setMealBase(result);
      setPortion(1);

      // initialize draft as base (1x)
      setMealDraft(result);
    } catch (e: any) {
      setMealMsg(e?.message ?? "Scan failed.");
    } finally {
      setMealDraftLoading(false);
    }
  }

  /* -----------------------------
     Portion Scaling
     (always scales FROM base)
  ------------------------------ */

  useEffect(() => {
    if (!mealBase) return;

    setMealDraft({
      ...mealBase,
      calories: scale(mealBase.calories, portion),
      proteinG: scale(mealBase.proteinG, portion),
      carbsG: scale(mealBase.carbsG, portion),
      fatG: scale(mealBase.fatG, portion),
    });
  }, [portion, mealBase]);

  async function saveMealDraft() {
    if (!mealDraft) return;

    setMealLoading(true);
    try {
      await onSaveMealDraft(mealDraft);
      clearMeal();
    } catch (e: any) {
      setMealMsg(e?.message ?? "Save failed.");
    } finally {
      setMealLoading(false);
    }
  }

  /* -----------------------------
     Render
  ------------------------------ */

  return (
    <section className={styles.card}>
      {/* Quick text */}
      <div className={styles.field}>
        <textarea
          className={styles.textarea}
          placeholder="Example: 2 eggs and toast"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
      </div>

      <div className={styles.btnRow}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          Save entry
        </button>

        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setMealPickerOpen((v) => !v)}
        >
          Use photo
        </button>
      </div>

      {/* Picker */}
      {mealPickerOpen && (
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => mealCameraRef.current?.click()}
          >
            Take photo
          </button>

          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => mealLibraryRef.current?.click()}
          >
            Choose photo
          </button>
        </div>
      )}

      <input
        ref={mealCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void setMealFromFile(f);
        }}
      />

      <input
        ref={mealLibraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void setMealFromFile(f);
        }}
      />

      {mealMsg ? <div className={styles.muted}>{mealMsg}</div> : null}

      {/* Draft UI */}
      {mealDraft && (
        <div style={{ display: "grid", gap: 12 }}>
          <img
            src={mealPreviewUrl ?? ""}
            style={{ width: "100%", borderRadius: 14 }}
          />

          <input
            className={styles.input}
            value={mealDraft.title}
            onChange={(e) =>
              setMealBase({ ...mealBase!, title: e.target.value })
            }
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <label className={styles.label}>Calories (kcal)</label>
              <input
                className={styles.input}
                value={mealDraft.calories ?? ""}
                readOnly
                placeholder="Calories"
              />
            </div>
            <div>
              <label className={styles.label}>Protein (g)</label>
              <input
                className={styles.input}
                value={mealDraft.proteinG ?? ""}
                readOnly
                placeholder="Protein"
              />
            </div>
            <div>
              <label className={styles.label}>Carbs (g)</label>
              <input
                className={styles.input}
                value={mealDraft.carbsG ?? ""}
                readOnly
                placeholder="Carbs"
              />
            </div>
            <div>
              <label className={styles.label}>Fat (g)</label>
              <input
                className={styles.input}
                value={mealDraft.fatG ?? ""}
                readOnly
                placeholder="Fat"
              />
            </div>
          </div>

          {/* Portion Slider */}
          <div>
            <div className={styles.muted}>
              Portion: {portion.toFixed(2)}x
            </div>

            <input
              type="range"
              min={0.25}
              max={2.5}
              step={0.05}
              value={portion}
              onChange={(e) => setPortion(Number(e.target.value))}
              style={{
                width: "100%",
                height: 36,
                accentColor: "#5b8cff",
              }}
            />
          </div>

          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={saveMealDraft}
              disabled={mealLoading}
            >
              Save meal
            </button>

            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={clearMeal}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
