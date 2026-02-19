"use client";

import { usePathname } from "next/navigation";

export default function ShellMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Key on pathname so the wrapper remounts and re-triggers CSS animation
  return (
    <main className="appMain">
      <div key={pathname} className="routeFade">
        {children}
      </div>
    </main>
  );
}