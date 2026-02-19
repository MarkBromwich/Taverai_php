"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../log/log.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const token = useMemo(() => sp.get("token") ?? "", [sp]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);

    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Reset failed.");
      } else {
        setMsg("Password updated. Please log in.");
        // send them to login after success
        router.push("/login");
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.container} style={{ maxWidth: 520 }}>
      <section className={styles.card}>
        <div className={styles.h2Row}>
          <h2 className={styles.h2}>Set a new password</h2>
          <span className={styles.small}>Taverai</span>
        </div>

        {error && (
          <div className={styles.error} style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        {msg && (
          <div className={styles.muted} style={{ marginTop: 12 }}>
            {msg}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </div>

          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.label} htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              className={styles.input}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Re-type password"
              required
            />
            {!loading && confirm.length > 0 && !passwordsMatch && (
              <div className={styles.muted} style={{ marginTop: 6 }}>
                Passwords don’t match yet.
              </div>
            )}
          </div>

          <button
            type="submit"
            className={styles.authBtn}
            disabled={loading}
            style={{ marginTop: 14 }}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}