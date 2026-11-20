import type { Metadata, Viewport } from "next";
import { bodyFont, displayFont } from "@/theme/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parent-Teacher Meeting",
  description: "Book your parent-teacher meeting slot.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eaf6ff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
