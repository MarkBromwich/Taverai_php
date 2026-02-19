"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

type MeUser = {
  id: string;
  username: string; // email
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;

  avatarUrl?: string | null;
  paidStatus?: string | null;
  billingUrl?: string | null;

  dailyCalorieGoal?: number | null;

  theme?: string | null;
  units?: string | null;
  healthAppProvider?: string | null;
  healthAppConnected?: boolean | null;
};

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMe() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMe(null);
        setError(j?.error ?? "Failed to load account");
        return;
      }

      setMe(j?.user ?? null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const displayName =
    me?.displayName?.trim() ||
    [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim() ||
    me?.username ||
    "—";

  const handle = me?.username ? `@${me.username}` : "—";
  const paidStatus = me?.paidStatus || "Free";

  const initial = (displayName?.trim()?.[0] || "U").toUpperCase();

  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <div className={styles.avatar} aria-hidden="true">
          {initial}
        </div>

        <div className={styles.topText}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{loading ? "Loading…" : displayName}</h1>
            <span className={styles.pill}>{paidStatus}</span>
          </div>

          <div className={styles.handle}>{loading ? "" : handle}</div>

          {error ? (
            <div className={styles.errorLine}>Load error: {error}</div>
          ) : (
            <div className={styles.sub}>
              Manage your account, settings, and connections.
            </div>
          )}
        </div>
      </header>

      {/* Account security */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>Account security</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Password reset</div>
              <div className={styles.rowDesc}>
                Send yourself a reset link to update your password.
              </div>
            </div>

            <button
              className={styles.btn}
              onClick={() => alert("Stub: password reset flow")}
            >
              Send link
            </button>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>Subscription</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Current paid status</div>
              <div className={styles.rowDesc}>
                You’re currently on <strong>{paidStatus}</strong>.
              </div>
            </div>

            <button
              className={styles.btnPrimary}
              onClick={() => {
                if (me?.billingUrl) window.location.href = me.billingUrl;
                else alert("Stub: billing/manage subscription link");
              }}
            >
              Manage
            </button>
          </div>
        </div>
      </section>

      {/* Personal info */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>Personal info</div>
        <div className={styles.cardBody}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>First name</div>
              <div className={styles.infoValue}>{me?.firstName ?? "—"}</div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Last name</div>
              <div className={styles.infoValue}>{me?.lastName ?? "—"}</div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Email</div>
              <div className={styles.infoValue}>{me?.username ?? "—"}</div>
            </div>
          </div>

          <div className={styles.rowActions}>
            <button
              className={styles.btn}
              onClick={() => alert("Stub: personal info edit form")}
            >
              Update
            </button>
          </div>
        </div>
      </section>

      {/* App settings */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>App settings</div>
        <div className={styles.cardBody}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Daily calorie goal</div>
              <div className={styles.infoValue}>
                {me?.dailyCalorieGoal != null ? `${me.dailyCalorieGoal} kcal` : "—"}
              </div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Units</div>
              <div className={styles.infoValue}>{me?.units ?? "—"}</div>
            </div>

            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Theme</div>
              <div className={styles.infoValue}>{me?.theme ?? "—"}</div>
            </div>
          </div>

          <div className={styles.rowActions}>
            <button className={styles.btn} onClick={() => alert("Stub: settings")}>
              Open
            </button>
          </div>
        </div>
      </section>

      {/* Connections */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>Connections</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Link phone health app</div>
              <div className={styles.rowDesc}>
                Connect Apple Health / Google Fit (coming soon).
              </div>
            </div>
            <button className={styles.btn} onClick={() => alert("Stub: connect")}>
              Connect
            </button>
          </div>
        </div>
      </section>

      {/* Data */}
      <section className={styles.card}>
        <div className={styles.cardTitle}>Data</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Export data</div>
              <div className={styles.rowDesc}>
                Download your entries and reports (stub).
              </div>
            </div>
            <button className={styles.btn} onClick={() => alert("Stub: export")}>
              Export
            </button>
          </div>
        </div>
      </section>

      {/* Session */}
      <section className={`${styles.card} ${styles.dangerCard}`}>
        <div className={styles.cardTitle}>Session</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Sign out</div>
              <div className={styles.rowDesc}>End this session on this device.</div>
            </div>

            <button className={styles.btnDanger} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}