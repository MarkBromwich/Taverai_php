"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { BookOpen, Brain, ClipboardList, User } from "lucide-react";
import styles from "./shell.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  { href: "/log", label: "Log", icon: <BookOpen size={20} /> },
  { href: "/coach", label: "Coach", icon: <Brain size={20} /> },
  { href: "/plans", label: "Plans", icon: <ClipboardList size={20} /> },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={`${styles.header} topBar`}>
      <div className={styles.shell}>
        <div className={styles.headerRow}>

          {/* Brand */}
          <Link href="/log" className={styles.brand} aria-label="Go to log">
            <span className={styles.logoWrap} aria-hidden="true">
              <Image
                src="/taverai-logo.png"
                alt=""
                width={40}
                height={40}
                priority
              />
            </span>

            <div className={styles.brandText}>
              <div className={styles.brandName}>Taverai</div>
              <div className={styles.brandTagline}>
                Track • Score • Improve
              </div>
            </div>
          </Link>

          {/* Right Side */}
          <div className={styles.headerRight}>
            <nav className={styles.nav} aria-label="Primary navigation">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""
                      }`}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navText}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* You */}
            <Link
              href="/account"
              className={`${styles.navLink} ${pathname === "/account" ? styles.navLinkActive : ""
                }`}
            >
              <User size={20} />
              <span className={styles.navText}>You</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}