import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

/**
 * Next.js Metadata API renders the tags iOS needs for Add to Home Screen:
 *  - `manifest` links /manifest.json (display: standalone hides Safari UI)
 *  - `appleWebApp.capable` emits <meta name="apple-mobile-web-app-capable">
 *    plus the modern `mobile-web-app-capable` — the legacy signal older iOS
 *    versions require to launch full screen
 *  - `statusBarStyle: black-translucent` lets content flow behind the iOS
 *    status bar (paired with viewportFit: cover + safe-area padding below)
 *  - `icons.apple` is what iOS actually uses for the home-screen icon
 *    (iOS ignores manifest icons; the 180x180 apple-touch-icon is the one
 *    that matters)
 */
export const metadata: Metadata = {
  title: "Penny Tracker",
  description: "Scan barcodes and track $0.01 penny deals at stores near you.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Penny Tracker",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Next 15 emits the modern `mobile-web-app-capable` tag; pre-iOS-16.4
  // Safari only understands the apple-prefixed original, so emit it too.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

/**
 * `viewportFit: "cover"` makes the page extend into the iPhone notch/home
 * indicator area; env(safe-area-inset-*) in globals.css pads UI back out of
 * it. maximumScale/userScalable pinned to stop iOS auto-zooming form inputs
 * — the biggest "doesn't feel native" giveaway in home-screen web apps.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0f14",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {/* pb-nav reserves space for the fixed bottom bar + safe area */}
        <main className="mx-auto min-h-dvh w-full max-w-lg pb-nav">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
