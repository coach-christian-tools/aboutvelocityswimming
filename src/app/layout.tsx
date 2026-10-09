import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/features/workshare/contexts/AuthContext";
import SiteAccount from "@/components/shared/SiteAccount";
import Header from "@/components/Header";
import NavigationScroll from "@/components/NavigationScroll";

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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#102638" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://aboutvelocityswimming.com"),
  title: "Velocity Swimming | Wenatchee Valley",
  description:
    "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
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
    description:
      "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
    url: "https://aboutvelocityswimming.com",
    siteName: "Velocity Swimming",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Velocity Swimming",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
    title: "Velocity Swimming | Wenatchee Valley",
    description:
      "Fostering excellence, resilience, and community from learn-to-swim to masters in North Central Washington.",
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
                  var stored = localStorage.getItem('velocity-theme') || localStorage.getItem('theme') || 'system';
                  localStorage.setItem('velocity-theme',stored);
                  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = stored === 'system' ? (systemDark ? 'dark' : 'light') : stored;
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.setAttribute('data-theme-preference', stored);

                  var metaTheme = document.querySelector('meta[name="theme-color"]');
                  if (metaTheme) {
                    metaTheme.setAttribute('content', theme === 'dark' ? '#102638' : '#FFFFFF');
                  }

                  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
                    var curPref = localStorage.getItem('velocity-theme') || localStorage.getItem('theme') || 'system';
                    if (curPref === 'system') {
                      var newTheme = e.matches ? 'dark' : 'light';
                      document.documentElement.setAttribute('data-theme', newTheme);
                      if (metaTheme) {
                        metaTheme.setAttribute('content', newTheme === 'dark' ? '#102638' : '#FFFFFF');
                      }
                    }
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${outfit.variable} ${bebas.variable}`}
      >
        <NavigationScroll />
        <AuthProvider>
          <Header />
          <SiteAccount />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
