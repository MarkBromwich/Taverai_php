"use client";

import Link from "next/link";
import { Book, Brain, Clipboard, User, UtensilsCrossed } from "lucide-react";
import styles from "./shell.module.css";

export default function SiteFooter() {
  const year = 2026;
  return (
    <footer className={styles.footer}>
      <div className={styles.shell}>
        <div className={styles.footerRow}>
          <div className={styles.footerLeft}>
            <div className={styles.footerBrand}>Food App</div>
            <div className={styles.footerMuted}>
              Built for simple daily logging and plan compliance.
            </div>
          </div>

          <div className={styles.footerLinks}>
            <Link className={styles.footerLink} href="/log">
              <Book size={18} strokeWidth={2} />
              <span>Log</span>
            </Link>

            <Link className={styles.footerLink} href="/coach">
              <Brain size={18} strokeWidth={2} />
              <span>Coach</span>
            </Link>

            <Link className={styles.footerLink} href="/menu">
              <UtensilsCrossed size={18} strokeWidth={2} />
              <span>Menu</span>
            </Link>

            <Link className={styles.footerLink} href="/plans">
              <Clipboard size={18} strokeWidth={2} />
              <span>Plans</span>
            </Link>

            <Link className={styles.footerLink} href="/account">
              <User size={18} strokeWidth={2} />
              <span>You</span>
            </Link>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span className={styles.footerMuted}>
            © {year} Food App
          </span>
        </div>
      </div>
    </footer>
  );
}
