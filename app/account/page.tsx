"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

type MeUser = {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  paidStatus?: string | null;
  billingUrl?: string | null;
  dailyCalorieGoal?: number | null;
  theme?: string | null;
  units?: string | null;
  healthAppConnected?: boolean | null;
};

type AccountSummary = {
  entryCount: number;
  planCount: number;
  savedMealCount: number;
};

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applyThemePreference(pref: string | null | undefined) {
  if (typeof document === "undefined") return;
  const resolved =
    pref === "light" || pref === "dark"
      ? pref
      : window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  window.localStorage.setItem("taverai-theme", pref ?? "dark");
}

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeUser | null>(null);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [settingsGoalEnabled, setSettingsGoalEnabled] = useState(true);
  const [settingsGoal, setSettingsGoal] = useState("2000");
  const [settingsUnits, setSettingsUnits] = useState("metric");
  const [settingsTheme, setSettingsTheme] = useState("dark");
  const [savingSettings, setSavingSettings] = useState(false);

  const [healthConnected, setHealthConnected] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function loadPage() {
    setError(null);
    setLoading(true);
    try {
      const [meRes, summaryRes] = await Promise.all([
        fetch("/api/me", { cache: "no-store" }),
        fetch("/api/account/summary", { cache: "no-store" }),
      ]);

      const meJson = await meRes.json().catch(() => ({}));
      const summaryJson = await summaryRes.json().catch(() => ({}));

      if (!meRes.ok) {
        setMe(null);
        setSummary(null);
        setError(meJson?.error ?? "Failed to load account");
        return;
      }

      const user = meJson?.user ?? null;
      setMe(user);
      setSummary(
        summaryJson?.summary ?? {
          entryCount: 0,
          planCount: 0,
          savedMealCount: 0,
        }
      );

      setProfileFirstName(user?.firstName ?? "");
      setProfileLastName(user?.lastName ?? "");
      setProfileEmail(user?.username ?? "");
      setSettingsGoalEnabled(user?.dailyCalorieGoal != null);
      setSettingsGoal(String(user?.dailyCalorieGoal ?? 2000));
      setSettingsUnits(user?.units ?? "metric");
      setSettingsTheme(user?.theme ?? "dark");
      setHealthConnected(Boolean(user?.healthAppConnected));
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setMe(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  async function signOut() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: profileFirstName,
          lastName: profileLastName,
          username: profileEmail,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to save profile");
      setMe(j.user);
      setFlash("Profile saved.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    setUploadingAvatar(true);
    setFlash(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Avatar upload failed");
      setMe((current) => (current ? { ...current, avatarUrl: j.avatarUrl ?? null } : current));
      setFlash("Profile photo updated.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setFlash(null);
    setError(null);
    try {
      const dailyCalorieGoal = settingsGoalEnabled ? Number(settingsGoal) : null;
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyCalorieGoal,
          units: settingsUnits,
          theme: settingsTheme,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to save settings");
      setMe(j.user);
      applyThemePreference(j.user?.theme ?? settingsTheme);
      setFlash("Settings saved.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveConnection(nextConnected: boolean) {
    setSavingConnection(true);
    setFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthAppConnected: nextConnected,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Failed to save connection");
      setMe(j.user);
      setHealthConnected(Boolean(j.user?.healthAppConnected));
      setFlash(nextConnected ? "Health connection marked as connected." : "Health connection disconnected.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingConnection(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Export failed");
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(j, `taverai-export-${stamp}.json`);
      setFlash("Export downloaded.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  }

  const displayName = useMemo(
    () =>
      me?.displayName?.trim() ||
      [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim() ||
      me?.username ||
      "—",
    [me]
  );

  const handle = me?.username ? `@${me.username}` : "—";
  const paidStatus = me?.paidStatus || "Free";
  const initial = (displayName?.trim()?.[0] || "U").toUpperCase();

  return (
    <div className={styles.wrap}>
      <header className={styles.top}>
        <label className={styles.avatarUpload}>
          <div className={styles.avatar} aria-hidden="true">
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className={styles.avatarImage} />
            ) : (
              initial
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={(e) => {
              void uploadAvatar(e.target.files?.[0] ?? null);
            }}
          />
          <span className={styles.avatarHint}>{uploadingAvatar ? "Uploading…" : "Change photo"}</span>
        </label>

        <div className={styles.topText}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{loading ? "Loading…" : displayName}</h1>
            <span className={styles.pill}>{paidStatus}</span>
          </div>
          <div className={styles.handle}>{loading ? "" : handle}</div>
          <div className={styles.sub}>
            Manage your profile, settings, exports, and connection status.
          </div>
          {flash ? <div className={styles.successLine}>{flash}</div> : null}
          {error ? <div className={styles.errorLine}>Error: {error}</div> : null}
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Overview</div>
        <div className={styles.cardBody}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Logged meals</div>
              <div className={styles.infoValue}>{summary?.entryCount ?? "—"}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Active plans</div>
              <div className={styles.infoValue}>{summary?.planCount ?? "—"}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>Saved meals</div>
              <div className={styles.infoValue}>{summary?.savedMealCount ?? "—"}</div>
            </div>
          </div>
        </div>
      </section>

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
            <a className={styles.btn} href={`/forgot${me?.username ? `?email=${encodeURIComponent(me.username)}` : ""}`}>
              Send link
            </a>
          </div>
        </div>
      </section>

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
                else setFlash("Billing management is not configured yet.");
              }}
            >
              Manage
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Personal info</div>
        <div className={styles.cardBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>First name</span>
              <input className={styles.input} value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Last name</span>
              <input className={styles.input} value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input className={styles.input} value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
            </label>
          </div>
          <div className={styles.rowActions}>
            <button className={styles.btnPrimary} onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>App settings</div>
        <div className={styles.cardBody}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Daily calorie goal</span>
              <div className={styles.inlineField}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={settingsGoalEnabled}
                    onChange={(e) => setSettingsGoalEnabled(e.target.checked)}
                  />
                  <span>Enable</span>
                </label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={5000}
                  step={25}
                  disabled={!settingsGoalEnabled}
                  value={settingsGoal}
                  onChange={(e) => setSettingsGoal(e.target.value)}
                />
              </div>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Units</span>
              <select className={styles.select} value={settingsUnits} onChange={(e) => setSettingsUnits(e.target.value)}>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Theme</span>
              <select className={styles.select} value={settingsTheme} onChange={(e) => setSettingsTheme(e.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
          </div>
          <div className={styles.rowActions}>
            <button className={styles.btnPrimary} onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Connections</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Phone health app</div>
              <div className={styles.rowDesc}>
                Mark whether you’ve linked a health app. This is a simple connection status for now.
              </div>
            </div>
            <button
              className={healthConnected ? styles.btnPrimary : styles.btn}
              onClick={() => saveConnection(!healthConnected)}
              disabled={savingConnection}
            >
              {savingConnection ? "Saving…" : healthConnected ? "Connected" : "Connect"}
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Data</div>
        <div className={styles.cardBody}>
          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Export account data</div>
              <div className={styles.rowDesc}>
                Download your profile, preferences, plans, entries, and saved meals as JSON.
              </div>
            </div>
            <button className={styles.btn} onClick={exportData} disabled={exporting}>
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>
      </section>

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
