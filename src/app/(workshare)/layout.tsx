import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-workshare-outfit", display: "swap" });
export const metadata: Metadata = {
  metadataBase: new URL("https://aboutvelocityswimming.com"),
  title: "Workshare | Velocity Swimming",
  description: "Manage your family's volunteer shifts and workshare hours.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f8fafc",
};
export default function WorkshareLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={outfit.variable}>{children}</body></html>;
}
