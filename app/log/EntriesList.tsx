"use client";

import styles from "./log.module.css";
import type { Entry } from "./page";

type Props = {
  loading: boolean;
  entries: Entry[];
  planId: string | null;
};

export default function EntriesList({ loading, entries, planId }: Props) {
  if (loading) {
    return (
      <section className={styles.card}>
        <h2 className={styles.h2}>Recent entries</h2>
        <div className={styles.muted}>Loading…</div>
      </section>
    );
  }

  if (!entries.length) {
    return (
      <section className={styles.card}>
        <h2 className={styles.h2}>Recent entries</h2>
        <div className={styles.muted}>No entries yet</div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.h2}>Recent entries</h2>

      <div style={{ marginTop: 12 }}>
        {entries.map((e) => {
          const score =
            planId &&
            e.scores?.find((s) => s.plan.id === planId)?.score;

          return (
            <div key={e.id} className={styles.entryItem}>
              <div style={{ fontWeight: 600 }}>{e.text}</div>

              <div
                style={{
                  marginTop: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div className={styles.small}>
                  {new Date(e.createdAt).toLocaleString()}
                </div>

                {typeof score === "number" && (
                  <div className={styles.entryScore}>
                    {score}/100
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}