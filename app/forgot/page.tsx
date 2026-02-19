"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../log/log.module.css";

export default function ForgotPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      setMsg(data?.message ?? "If that email exists, a reset link has been sent.");
    } catch {
      setMsg("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.container} style={{ maxWidth: 520 }}>
      <section className={styles.card}>
        <div className={styles.h2Row}>
          <h2 className={styles.h2}>Reset password</h2>
          <span className={styles.small}>Taverai</span>
        </div>

        <div className={styles.muted} style={{ marginTop: 10 }}>
          Enter the email you used to sign up. If it exists, we’ll send a reset link.
        </div>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              required
            />
          </div>

          <button
            type="submit"
            className={styles.authBtn}
            disabled={loading}
            style={{ marginTop: 14 }}
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          {msg && (
            <div className={styles.muted} style={{ marginTop: 12 }}>
              {msg}
            </div>
          )}

          <div className={styles.btnRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => router.push("/login")}
            >
              Back to login
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}