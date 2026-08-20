import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aboutvelocityswimming.com"),
  title: "Velocity Swimming | Wenatchee Valley",
  description: "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
  keywords: [
    "Velocity Swimming",
    "Wenatchee Valley",
    "Swim Team",
    "Swimming",
    "North Central Washington",
    "Learn to swim",
    "Masters swimming",
    "Competitive swimming",
  ],
  openGraph: {
    title: "Velocity Swimming | Wenatchee Valley",
    description: "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
    url: "https://aboutvelocityswimming.com",
    siteName: "Velocity Swimming",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Velocity Swimming | Wenatchee Valley",
    description: "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable}`}>
        {children}
      </body>
    </html>
  );
}
