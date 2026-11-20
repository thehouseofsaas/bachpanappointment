import type { Metadata, Viewport } from "next";
import { bodyFont, displayFont } from "@/theme/fonts";
import { KeyboardAware } from "@/components/ui/keyboard-aware";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parent-Teacher Meeting",
  description: "Book your parent-teacher meeting slot.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays allowed (no maximumScale / userScalable).
  // Android Chrome: shrink the page when the keyboard opens, so fields can scroll above it.
  interactiveWidget: "resizes-content",
  // Draw under notches and rounded corners; the layout pads with safe-area insets.
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#eaf6ff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <KeyboardAware />
        {children}
      </body>
    </html>
  );
}
