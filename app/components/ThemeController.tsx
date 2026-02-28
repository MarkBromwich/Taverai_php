"use client";

import { useEffect } from "react";

function resolveTheme(pref: string | null | undefined) {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applyTheme(pref: string | null | undefined) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export default function ThemeController() {
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("taverai-theme") : null;
    if (stored) applyTheme(stored);

    let cancelled = false;
    async function loadTheme() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const pref = typeof j?.user?.theme === "string" ? j.user.theme : stored;
        if (pref && typeof window !== "undefined") window.localStorage.setItem("taverai-theme", pref);
        applyTheme(pref);
      } catch {
        applyTheme(stored);
      }
    }
    void loadTheme();

    if (typeof window !== "undefined") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => {
        const pref = window.localStorage.getItem("taverai-theme");
        if (!pref || pref === "system") applyTheme("system");
      };
      media.addEventListener?.("change", onChange);
      return () => {
        cancelled = true;
        media.removeEventListener?.("change", onChange);
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
