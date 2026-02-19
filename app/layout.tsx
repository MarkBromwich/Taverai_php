import "./globals.css";

import SiteHeader from "@/app/components/SiteHeader";
import SiteBottomNav from "@/app/components/SiteBottomNav";
import SiteFooter from "@/app/components/SiteFooter";
import ShellMain from "@/app/components/ShellMain";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
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