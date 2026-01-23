import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";

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
  const session = await auth();

  return (
    <html lang="en">
      <head>
        {/* ... existing head content ... */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
          <div className="min-h-screen bg-background">
            <header className="border-b">
              <div className="container mx-auto px-4 py-4">
                <nav className="flex items-center justify-between">
                  <Link href="/" className="text-xl font-bold">
                    SMKC Score System
                  </Link>
                  <div className="flex gap-6 items-center">
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
                    {session ? (
                      <div className="flex items-center gap-4">
                        <Link
                          href="/profile"
                          className="text-sm font-medium hover:underline text-foreground"
                        >
                          {session.user?.userType === 'player'
                            ? session.user?.nickname
                            : session.user?.name || session.user?.email
                          }
                        </Link>
                        <form
                          action={async () => {
                            "use server"
                            await signOut()
                          }}
                        >
                          <button className="text-sm font-medium hover:underline text-destructive">
                            Sign Out
                          </button>
                        </form>
                      </div>
                    ) : (
                      <Link
                        href="/auth/signin"
                        className="text-sm font-medium hover:underline"
                      >
                        Login
                      </Link>
                    )}
                  </div>
                </nav>
              </div>
            </header>
            <main className="container mx-auto px-4 py-8">{children}</main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
