"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Book, Brain, ClipboardList, User, UtensilsCrossed } from "lucide-react";
import styles from "./shell.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/log",
    label: "Log",
    icon: <Book size={20} strokeWidth={2} />,
  },
  {
    href: "/coach",
    label: "Coach",
    icon: <Brain size={20} strokeWidth={2} />,
  },
  {
    href: "/menu",
    label: "Menu",
    icon: <UtensilsCrossed size={20} strokeWidth={2} />,
  },
  {
    href: "/plans",
    label: "Plans",
    icon: <ClipboardList size={20} strokeWidth={2} />,
  },
  {
    href: "/account",
    label: "You",
    icon: <User size={20} strokeWidth={2} />,
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SiteBottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.bottomNav}>
      <div className={styles.bottomNavInner}>
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            >
              <div className={styles.tabIconWrap}>
                {item.icon}
              </div>
              <span className={styles.tabLabel}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
