import Provider from "@/components/Provider";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Anonymous_Pro } from "next/font/google";
import "./globals.css";

const anonymousPro = Anonymous_Pro({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-anonymous-pro",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://browsegyms.com";
const siteName = "Browsegyms";
const description = "Find the right gym at the right price.";
const previewImage = `${siteUrl}/brand/browsegyms-share.png`;
const pwaIcon = "/brand/browsegyms-apple.png?v=2";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Browse  Gyms",
    template: "%s | Browse  Gyms",
  },
  description,
  openGraph: {
    title: siteName,
    description,
    url: siteUrl,
    siteName,
    locale: "en_US",
    type: "website",
    images: [
      {
        url: previewImage,
        width: 1200,
        height: 630,
        alt: "Preview of Browsegyms",
      },
    ],
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2" },
    ],
    apple: [{ url: pwaIcon, sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
  ],
};

const themeInitScript = `
  try {
    const storedTheme = window.localStorage.getItem("theme");
    const useDark = storedTheme !== "light";
    document.documentElement.classList.toggle("dark", useDark);
  } catch {
    document.documentElement.classList.add("dark");
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className={`${anonymousPro.variable} antialiased font-sans`}>
        <Provider>
          {children}
          <Toaster />
        </Provider>
      </body>
    </html>
  );
}
