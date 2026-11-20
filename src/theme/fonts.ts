import { Baloo_2, Nunito } from "next/font/google";

// Both are variable fonts: one small file each covers every weight we use.
// They are downloaded at build time and served from this site (no request to
// Google from a parent's phone).

/** Rounded, chunky headings and buttons. */
export const displayFont = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/** Friendly, very legible body text and numbers. */
export const bodyFont = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
