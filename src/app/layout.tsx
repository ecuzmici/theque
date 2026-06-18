import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import Script from "next/script";

import { ThemeProvider } from "@/components/theme/ThemeProvider";

import "./globals.css";

const themeInitScript = `
(function () {
  try {
    var key = "theque-theme";
    var stored = localStorage.getItem(key);
    var dark =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (_) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const thequeSerif = Source_Serif_4({
  variable: "--font-theque-serif",
  subsets: ["latin"],
});

const thequeHeading = Newsreader({
  variable: "--font-theque-heading",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://theque.app"),
  title: "thèque | Private taste library",
  description:
    "Save books, films, places, and anything worth a second look. Each link becomes a card on a shelf — a private library of your taste, not a pile of dead bookmarks.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "thèque",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "thèque",
    url: "https://theque.app",
    title: "thèque | Private taste library",
    description:
      "Save books, films, places, and anything worth a second look. Each link becomes a card on a shelf.",
  },
  twitter: {
    card: "summary_large_image",
    title: "thèque | Private taste library",
    description:
      "Save books, films, places, and anything worth a second look. Each link becomes a card on a shelf.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${thequeSerif.variable} ${thequeHeading.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script id="theque-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
