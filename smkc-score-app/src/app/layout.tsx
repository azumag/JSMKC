/**
 * layout.tsx — Root Layout (Paddock Editorial)
 *
 * Top-level layout for every route. Provides:
 *  - Distinctive type stack: Anton (display), Manrope (sans), JetBrains Mono
 *    (numerics) — wired to Tailwind theme tokens via CSS variables in
 *    globals.css.
 *  - The global pit-board header: SMKC racing-number lockup, primary nav,
 *    LocaleSwitcher, AuthHeader. A 4px checker strip caps the header so
 *    the page below feels like it sits on a paddock pit-board.
 *  - i18n via NextIntlClientProvider and auth via SessionProvider.
 *
 * Overlay routes (`/.../overlay`) are detected via the middleware-injected
 * `x-pathname` header so we can render them with no chrome and no
 * `bg-background` shell. The body adds the `overlay-mode` class which
 * globals.css uses to enforce a transparent canvas — this is critical for
 * OBS browser-source compositing and must not regress.
 */
import type { Metadata } from "next";
import { Anton, Manrope, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { AuthHeader } from "@/components/AuthHeader";
import { Toaster } from "sonner";
import { NavLabelClient } from "@/components/NavLabel";

/*
 * Font wiring. CSS variable names match the @theme inline declarations
 * in globals.css (`--font-display`, `--font-sans`, `--font-mono`).
 *
 * Anton has a single 400 weight — using it at large sizes with letter
 * tracking gives the condensed-display "race programme cover" feel.
 * Manrope ships variable-weight axes for the body. JetBrains Mono is
 * the workhorse for tabular figures (times, scores, ranks).
 */
const fontDisplay = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});
const fontSans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SMKC Score System",
  description: "SMKC Score Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  /*
   * Detect the OBS overlay route via the middleware-injected `x-pathname`
   * header. On overlay pages we skip the global header, the bg-background
   * shell, and the main padding so the page renders fully transparent
   * from the first paint, avoiding any FOUC over the broadcast canvas.
   */
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isOverlay = pathname.includes("/overlay");

  return (
    <html
      lang={locale}
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head />
      <body
        className={`font-sans antialiased${isOverlay ? " overlay-mode" : ""}`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>
            {isOverlay ? (
              /* Overlay route: render only the page tree — no header, no
                 bg-background wrapper, no main padding, no Sonner toaster
                 (sonner would pollute the transparent canvas). */
              children
            ) : (
              <>
                <div className="min-h-screen bg-background">
                  {/*
                   * Single page-wide paddock cue — a 3px checker strip
                   * pinned to the top edge. It's the only global
                   * decorative element; everything below stays calm.
                   */}
                  <div className="checker-strip h-[3px]" aria-hidden="true" />
                  <header className="border-b border-foreground/15 bg-background">
                    <div className="container mx-auto px-5 sm:px-6">
                      <nav className="flex items-center justify-between gap-4 py-3 sm:py-4">
                        <Link
                          href="/"
                          className="font-display text-xl sm:text-2xl tracking-[0.18em] text-foreground whitespace-nowrap"
                          aria-label="SMKC home"
                        >
                          SMKC
                        </Link>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <NavLink href="/players" messageKey="players" />
                          <NavLink href="/tournaments" messageKey="tournaments" />
                          <span
                            className="hidden sm:block w-px h-6 bg-foreground/15 mx-1"
                            aria-hidden="true"
                          />
                          <LocaleSwitcher />
                          <AuthHeader />
                        </div>
                      </nav>
                    </div>
                  </header>
                  <main className="container mx-auto px-5 sm:px-6 py-10">
                    {children}
                  </main>
                </div>
                <Toaster richColors position="bottom-right" />
              </>
            )}
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * NavLink — pit-board navigation entry. Pure presentation; no active
 * state because these are top-level entry points and inner pages own
 * their own selected state via the tournament tab bar.
 */
function NavLink({
  href,
  messageKey,
}: {
  href: string;
  messageKey: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <NavLabelClient messageKey={messageKey} />
    </Link>
  );
}
