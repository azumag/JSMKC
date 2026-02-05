/**
 * layout.tsx - Root Layout Component
 *
 * This is the top-level layout for the entire JSMKC application.
 * It provides:
 * 1. HTML document structure with locally-bundled Geist fonts (Sans + Mono)
 * 2. Global metadata (title, description) for SEO
 * 3. NextAuth SessionProvider for client-side session access
 * 4. NextIntlClientProvider for i18n translation support
 * 5. Shared navigation header with AuthHeader client component
 * 6. Language switcher for toggling between English and Japanese
 * 7. Main content container with consistent padding
 *
 * Authentication display:
 * - AuthHeader uses client-side useSession() + signOut() to stay
 *   in sync with the SessionProvider, preventing stale session bugs
 *
 * i18n strategy:
 * - No URL-based locale routing; locale is determined by cookie or browser language
 * - NextIntlClientProvider wraps all children to provide useTranslations() in client components
 * - Server-side locale detection happens in src/i18n/request.ts
 *
 * This component is a Server Component (async) that fetches
 * locale data on the server side. Session handling is fully
 * client-side via SessionProvider and AuthHeader.
 */
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { AuthHeader } from "@/components/AuthHeader";

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
 * Fetches locale server-side for initial render. Auth state is handled
 * entirely client-side by AuthHeader to avoid stale session issues.
 *
 * @param children - The page content rendered inside this layout
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
                       * AuthHeader: Client component for authentication-aware UI.
                       * Uses client-side useSession() + signOut() to ensure the
                       * header's auth state stays in sync with the SessionProvider
                       * that page components also consume. This prevents stale
                       * session bugs after logout.
                       */}
                      <AuthHeader />
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
