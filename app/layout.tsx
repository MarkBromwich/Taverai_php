import "./globals.css";

import SiteHeader from "@/app/components/SiteHeader";
import SiteBottomNav from "@/app/components/SiteBottomNav";
import SiteFooter from "@/app/components/SiteFooter";
import ShellMain from "@/app/components/ShellMain";
import ThemeController from "@/app/components/ThemeController";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeController />
        <div className="appShell">
          <SiteHeader />
          <ShellMain>{children}</ShellMain>
          <SiteFooter />
          <SiteBottomNav />
        </div>
      </body>
    </html>
  );
}
