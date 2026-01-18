import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SMKC Score System",
  description: "Super Mario Kart Championship Score Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get nonce from middleware-generated headers
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') || crypto.randomUUID()
  
  return (
    <html lang="en">
      <head>
        {/* CSP header with nonce for security */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={
            process.env.NODE_ENV === 'production'
              ? [
                  "default-src 'self'",
                  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com`,
                  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
                  `font-src 'self' https://fonts.gstatic.com`,
                  `img-src 'self' data: blob: https://www.google-analytics.com`,
                  `connect-src 'self' https://api.github.com https://oauth2.googleapis.com`,
                  "frame-src 'none'",
                  "object-src 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "upgrade-insecure-requests"
                ].join('; ')
              : [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
                  "style-src 'self' 'unsafe-inline'",
                  "img-src 'self' data: blob:",
                  "connect-src 'self'",
                  "font-src 'self' data:",
                  "frame-ancestors 'none'",
                ].join('; ')
          }
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-background">
          <header className="border-b">
            <div className="container mx-auto px-4 py-4">
              <nav className="flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">
                  SMKC Score System
                </Link>
                <div className="flex gap-6">
                  <Link
                    href="/players"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Players
                  </Link>
                  <Link
                    href="/tournaments"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Tournaments
                  </Link>
                </div>
              </nav>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
