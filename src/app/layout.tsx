import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EPIC Scout", template: "%s | EPIC Scout" },
  description: "Event scouting and strategy for EPIC Robotz Team 4415.",
  applicationName: "EPIC Scout",
  icons: { apple: "/icons/icon-192.png" },
  appleWebApp: {
    capable: true,
    title: "EPIC Scout",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#f7f6f3" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try { var choice = localStorage.getItem("frc-scout-theme"); if (choice === "light" || choice === "dark") document.documentElement.setAttribute("data-theme", choice); var dark = choice === "dark" || (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches); var color = dark ? "#0d0d0f" : "#f7f6f3"; var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", color); } catch {}`}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
