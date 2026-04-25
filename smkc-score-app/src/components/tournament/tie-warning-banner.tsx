/**
 * TieWarningBanner Component
 *
 * Displays a yellow warning banner when unresolved tied ranks exist in a
 * qualification standings group (BM/MR/GP).
 *
 * Admins see a prompt to record the sudden-death playoff result.
 * Non-admins see a notice that resolution is pending.
 *
 * Only renders when hasTies is true; returns null otherwise to allow
 * unconditional placement above each group's standings table.
 */

"use client";
import { useTranslations } from "next-intl";

interface TieWarningBannerProps {
  hasTies: boolean;
  isAdmin: boolean;
}

export function TieWarningBanner({ hasTies, isAdmin }: TieWarningBannerProps) {
  const tc = useTranslations("common");

  if (!hasTies) return null;

  return (
    <div className="mb-2 flex items-center gap-2 rounded-sm border border-l-[3px] border-l-accent border-foreground/15 bg-accent/15 px-3 py-2 text-sm text-foreground">
      {/* Warning icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        {isAdmin
          ? tc("tiedRanksWarningAdmin")
          : tc("tiedRanksWarningViewer")}
      </span>
    </div>
  );
}
