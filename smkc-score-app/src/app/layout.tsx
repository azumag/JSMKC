/**
 * layout.tsx - Root Layout Component
 *
 * This is the top-level layout for the entire JSMKC application.
 * It provides:
 * 1. HTML document structure with locally-bundled Geist fonts (Sans + Mono)
 * 2. Global metadata (title, description) for SEO
 * 3. NextAuth SessionProvider for client-side session access
 * 4. NextIntlClientProvider for i18n translation support
 * 5. Shared navigation header with authentication-aware UI
 * 6. Language switcher for toggling between English and Japanese
 * 7. Main content container with consistent padding
 *
 * Authentication display logic:
 * - Logged-in users see their name/nickname and a Sign Out button
 * - Player accounts display their nickname (userType === 'player')
 * - Admin/OAuth accounts display their name or email
 * - Anonymous visitors see a Login link
 *
 * i18n strategy:
 * - No URL-based locale routing; locale is determined by cookie or browser language
 * - NextIntlClientProvider wraps all children to provide useTranslations() in client components
 * - Server-side locale detection happens in src/i18n/request.ts
 *
 * This component is a Server Component (async) that fetches the
 * session on the server side for initial render, then wraps
 * children in SessionProvider for client-side session hooks.
 */
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

/**
 * Page metadata for SEO and browser tab display.
 * Applied to all pages unless overridden by child layouts.
 */
export const metadata: Metadata = {
  title: "SMKC Score System",
  description: "SMKC Score Management System",
};

/**
 * RootLayout - The top-level server component that wraps all pages.
 *
 * Fetches the current authentication session and locale server-side so that
 * the navigation header can render the correct auth state and language on
 * the initial page load without a client-side hydration flash.
 *
 * @param children - The page content rendered inside this layout
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* Fetch session on the server for SSR of auth-aware navigation */
  const session = await auth();

  /* Fetch locale and translation messages for i18n */
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        {/* Additional head content can be added here (favicon, meta tags, etc.) */}
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {/*
         * NextIntlClientProvider passes locale and messages to all client components,
         * enabling useTranslations() hooks throughout the component tree.
         */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* SessionProvider makes the session available to all client components via useSession() */}
          <SessionProvider>
            <div className="min-h-screen bg-background">
              {/* Global navigation header with border separator */}
              <header className="border-b">
                <div className="container mx-auto px-4 py-4">
                  <nav className="flex items-center justify-between">
                    {/* Application logo/title linking to home page */}
                    <Link href="/" className="text-xl font-bold">
                      SMKC Score System
                    </Link>
                    <div className="flex gap-6 items-center">
                      {/* Primary navigation links - publicly accessible pages */}
                      <Link
                        href="/players"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <NavLabel messageKey="players" />
                      </Link>
                      <Link
                        href="/tournaments"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <NavLabel messageKey="tournaments" />
                      </Link>

                      {/*
                       * Language switcher toggle button.
                       * Displays "日本語" when in English mode, "English" when in Japanese mode.
                       */}
                      <LocaleSwitcher />

                      {/*
                       * Authentication-aware navigation section:
                       * - Authenticated: Show user identity + sign out button
                       * - Player accounts: Display nickname for recognition
                       * - Admin/OAuth accounts: Display name or email fallback
                       * - Unauthenticated: Show login link
                       */}
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
                          {/*
                           * Server Action form for sign out.
                           * Uses "use server" directive to execute signOut()
                           * on the server, avoiding client-side token handling.
                           */}
                          <form
                            action={async () => {
                              "use server"
                              await signOut()
                            }}
                          >
                            <button className="text-sm font-medium hover:underline text-destructive">
                              <NavLabel messageKey="signOut" />
                            </button>
                          </form>
                        </div>
                      ) : (
                        <Link
                          href="/auth/signin"
                          className="text-sm font-medium hover:underline"
                        >
                          <NavLabel messageKey="login" />
                        </Link>
                      )}
                    </div>
                  </nav>
                </div>
              </header>

              {/* Main content area - all page components render here */}
              <main className="container mx-auto px-4 py-8">{children}</main>
            </div>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * NavLabel - Client component wrapper for translated navigation labels.
 *
 * Since the root layout is a Server Component but uses translated strings
 * in JSX that needs to be a client-side hook, we use this thin wrapper
 * to access useTranslations() from the common namespace.
 * This avoids making the entire layout a client component.
 */
import { NavLabelClient } from "@/components/NavLabel";
function NavLabel({ messageKey }: { messageKey: string }) {
  return <NavLabelClient messageKey={messageKey} />;
}
