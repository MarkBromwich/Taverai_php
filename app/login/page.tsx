"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "../log/log.module.css";

export default function LoginPage() {
  const [username, setUsername] = useState(""); // email stored in username
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Safe redirect target
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") ? rawNext : "/log";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(), // normalize email
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error ?? "Invalid email or password.");
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
      <section
        className={styles.card}
        style={{ maxWidth: 460, margin: "0 auto" }}
      >
        {/* Logo */}
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            marginBottom: 12,
          }}
        >
          <Image
            src="/logo.png"
            alt="Taverai"
            width={132}
            height={132}
            priority
            style={{ borderRadius: 16 }}
          />
          <div className={styles.muted} style={{ marginTop: 2 }}>
            Sign in to continue
          </div>
        </div>

        {msg && <div className={styles.error}>{msg}</div>}

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              placeholder="you@email.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              inputMode="email"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={styles.input}
              placeholder="Your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className={styles.authBtn}
            disabled={loading}
            style={{ marginTop: 30 }}
          >
            {loading ? "Logging in…" : "Log in"}
          </button>

          <div className={styles.muted} style={{ marginTop: 12 }}>
            New here?{" "}
            <a href={`/signup?next=${encodeURIComponent(next)}`}>
              Create an account
            </a>
          </div>

          <p style={{ marginTop: 12 }}>
            <a href="/forgot">Forgot password?</a>
          </p>
        </form>
      </section>
    </main>
  );
}