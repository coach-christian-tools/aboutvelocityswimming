import { swimResourcesAsset } from '../../features/swim-resources/lib/routes.ts';
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aboutvelocityswimming.com"),
  title: "Swim Resources | Velocity Swimming",
  description: "Swimming resources, standards, and coaching data for Velocity Swimming.",
  icons: {
    icon: [
      {
        url: swimResourcesAsset("/initials-light.svg"),
        media: "(prefers-color-scheme: light)",
      },
      {
        url: swimResourcesAsset("/initials-dark.svg"),
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#202124" },
  ],
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
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || theme === 'light') {
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
