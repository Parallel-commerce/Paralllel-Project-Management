import { DM_Sans, Poppins } from "next/font/google";

import type { Metadata, Viewport } from "next";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "parallel. — Project Task Tracker",
  description:
    "Track tasks across projects with shared lists for your team and clients.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${poppins.variable} min-h-full antialiased`}
    >
      <body className="min-h-full font-sans text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
