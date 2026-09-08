import type { Metadata } from "next";
import { Inter, Outfit, Bebas_Neue } from "next/font/google";
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

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('velocity-theme') || 'system';
                  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = stored === 'system' ? (systemDark ? 'dark' : 'light') : stored;
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.setAttribute('data-theme-preference', stored);

                  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
                    var curPref = localStorage.getItem('velocity-theme') || 'system';
                    if (curPref === 'system') {
                      var newTheme = e.matches ? 'dark' : 'light';
                      document.documentElement.setAttribute('data-theme', newTheme);
                    }
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${outfit.variable} ${bebas.variable}`}>
        {children}
      </body>
    </html>
  );
}
