import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { CommandPalette } from "@/components/ux/CommandPalette";
import { Toaster } from "@/components/ux/Toaster";
import { THEME_SCRIPT } from "@/lib/prefs";

export const metadata: Metadata = {
  title: { default: "SAGASTA AI", template: "%s · SAGASTA AI" },
  description: "Dokumentové AI nástroje nad jednotnými daty projektu.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a121b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Přeskočit na obsah
        </a>
        <TopBar />
        <div id="main">{children}</div>
        <CommandPalette />
        <Toaster />
      </body>
    </html>
  );
}
