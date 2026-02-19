"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "../log/log.module.css";

export default function ResetClient() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token") ?? "";
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") ? rawNext : "/login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!token) {
      setMsg("Missing reset token.");
      return;
    }
    if (!password.trim()) {
      setMsg("Please enter a new password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error ?? "Reset failed.");
      } else {
        router.push(next);
        router.refresh();
      }
    } catch {
      setMsg("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.container} style={{ maxWidth: 520 }}>
      <section className={styles.card} style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "grid", justifyItems: "center", marginBottom: 12 }}>
          <Image
            src="/logo.png"
            alt="Taverai"
            width={132}
            height={132}
            priority
            style={{ borderRadius: 16 }}
          />
          <div className={styles.muted} style={{ marginTop: 2 }}>
            Set a new password
          </div>
        </div>

        {msg && <div className={styles.error}>{msg}</div>}

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className={styles.input}
              placeholder="Enter a new password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className={styles.authBtn}
            disabled={loading}
            style={{ marginTop: 30 }}
          >
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
      </section>
    </main>
  );
}