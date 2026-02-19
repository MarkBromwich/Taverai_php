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
  confidence?: number | null;
  notes?: string | null;
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
     Barcode
  ------------------------------ */

  const [mode, setMode] = useState<"none" | "manual" | "scan">("none");
  const [barcode, setBarcode] = useState("");
  const [bMsg, setBMsg] = useState<string | null>(null);
  const [bLoading, setBLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  function stopScan() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function submitBarcode(code: string) {
    const c = code.trim();
    if (!c) return;

    setBLoading(true);
    setBMsg(null);

    try {
      await onBarcode(c);
      setBarcode("");
      setMode("none");
      setBMsg("Saved ✅");
    } catch (e: any) {
      setBMsg(e?.message ?? "Barcode failed.");
    } finally {
      setBLoading(false);
      stopScan();
    }
  }

  async function startScan() {
    const BD = (globalThis as any).BarcodeDetector;
    if (!BD) {
      setMode("manual");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;
      setMode("scan");

      const v = videoRef.current;
      if (!v) return;

      v.srcObject = stream;
      await v.play();

      const detector = new BD();

      const tick = async () => {
        if (!videoRef.current) return;

        const codes = await detector.detect(videoRef.current);
        if (codes?.length) {
          const raw = codes[0]?.rawValue;
          if (raw) {
            stopScan();
            await submitBarcode(raw);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setMode("manual");
    }
  }

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
    setMealPreviewUrl(URL.createObjectURL(f));
    setMealFile(f);
    setMealPickerOpen(false);

    try {
      const result = await onMealPhoto(f);
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
          onClick={startScan}
        >
          Scan barcode
        </button>

        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setMealPickerOpen((v) => !v)}
        >
          Meal photo
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
            Choose file
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
            <input
              className={styles.input}
              value={mealDraft.calories ?? ""}
              readOnly
              placeholder="Calories"
            />
            <input
              className={styles.input}
              value={mealDraft.proteinG ?? ""}
              readOnly
              placeholder="Protein"
            />
            <input
              className={styles.input}
              value={mealDraft.carbsG ?? ""}
              readOnly
              placeholder="Carbs"
            />
            <input
              className={styles.input}
              value={mealDraft.fatG ?? ""}
              readOnly
              placeholder="Fat"
            />
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
      <p>&nbsp;</p><p>&nbsp;</p>
    </section>
  );
}