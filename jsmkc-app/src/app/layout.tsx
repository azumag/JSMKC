import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "JSMKC Score System",
  description: "Japan Super Mario Kart Championship Score Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-background">
          <header className="border-b">
            <div className="container mx-auto px-4 py-4">
              <nav className="flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">
                  JSMKC Score System
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
