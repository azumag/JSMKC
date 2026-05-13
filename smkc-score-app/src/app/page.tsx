/**
 * page.tsx — Home (Paddock Editorial, restrained)
 *
 *   1. A clean hero: Anton title + tagline + two CTAs. No checker bar,
 *      no edition stamp.
 *   2. Two entry panels for Players and Tournaments, side by side.
 *   3. A 4-up grid of game modes with a small numeric marker.
 *
 * Client Component because it reads `useSession()` to switch between
 * admin-management copy and read-only labels.
 */
'use client'

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";

const MODES = [
  { num: "01", titleKey: "timeTrial", descKey: "timeTrialDesc" },
  { num: "02", titleKey: "battleMode", descKey: "battleModeDesc" },
  { num: "03", titleKey: "matchRace", descKey: "matchRaceDesc" },
  { num: "04", titleKey: "grandPrix", descKey: "grandPrixDesc" },
] as const;

export default function Home() {
  const { data: session } = useSession();
  const t = useTranslations('home');
  const tc = useTranslations('common');

  const isAdmin = session?.user?.role === 'admin';

  /* Year stamp for the small caption above the hero — quiet paddock
     cue that doesn't compete with the title. */
  const year = new Date().getFullYear();

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="border-b border-foreground/15 pb-10">
        <p className="text-xs font-mono tabular tracking-[0.2em] uppercase text-muted-foreground mb-3">
          Round · {year}
        </p>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl leading-[0.9] text-foreground">
          {tc('appTitle')}
        </h1>
        <p className="mt-5 max-w-xl text-base sm:text-lg text-muted-foreground">
          {t('tagline')}
        </p>
      </section>

      {/* Entry panels */}
      <section className="grid md:grid-cols-2 gap-4">
        <EntryPanel
          title={tc('players')}
          description={isAdmin ? t('manageParticipants') : t('viewParticipants')}
          href="/players"
          cta={isAdmin ? t('managePlayers') : t('viewPlayers')}
        />
        <EntryPanel
          title={tc('tournaments')}
          description={isAdmin ? t('manageTournaments') : t('viewTournaments')}
          href="/tournaments"
          cta={t('viewTournamentsButton')}
        />
      </section>

      {/* Game modes grid */}
      <section>
        <header className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">{t('gameModes')}</h2>
          <p className="hidden sm:block text-sm text-muted-foreground">
            {t('availableFormats')}
          </p>
        </header>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/15 border border-foreground/15">
          {MODES.map((mode) => (
            <article
              key={mode.num}
              className="bg-card p-5 flex flex-col gap-2 min-h-[140px]"
            >
              <span className="text-xs font-mono tabular text-muted-foreground">
                #{mode.num}
              </span>
              <h3 className="text-lg font-semibold leading-tight">
                {t(mode.titleKey)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(mode.descKey)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * EntryPanel — simple titled card with description and CTA.
 */
function EntryPanel({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="border border-foreground/15 border-t-[3px] border-t-primary bg-card p-6 flex flex-col gap-4 transition-colors hover:border-foreground/40 hover:border-t-primary">
      <div>
        <h3 className="text-xl font-semibold leading-none">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild className="self-start">
        <Link href={href}>{cta}</Link>
      </Button>
    </article>
  );
}
