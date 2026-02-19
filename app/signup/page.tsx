"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "../log/log.module.css";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/log";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState(""); // email stored in username
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim().includes("@")) {
      setError("Please enter a valid email address.");
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
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          username: username.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ? `${data.error} — ${data.detail}` : data?.error || "Signup failed");
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setLoading(false);
    }
  }

  return (
    <main className={styles.container} style={{ maxWidth: 520 }}>
      <section className={styles.card} style={{ maxWidth: 460, margin: "0 auto" }}>
        {/* Logo */}
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
            Create your account
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              className={styles.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Mark"
              autoComplete="given-name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              className={styles.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Bromwich"
              autoComplete="family-name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email (this is your username)
            </label>
            <input
              id="email"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@email.com"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type your password"
              type="password"
              autoComplete="new-password"
              required
            />
            {!loading && confirmPassword.length > 0 && !passwordsMatch && (
              <div className={styles.muted} style={{ marginTop: 6 }}>
                Passwords don’t match yet.
              </div>
            )}
          </div>

          <button type="submit" className={styles.authBtn} disabled={loading} style={{ marginTop: 20 }}>
            {loading ? "Creating…" : "Create account"}
          </button>

          <div className={styles.muted} style={{ marginTop: 12 }}>
            Already have an account? <a href={`/login?next=${encodeURIComponent(next)}`}>Log in</a>
          </div>
        </form>
      </section>
    </main>
  );
}