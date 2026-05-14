"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PlayoffCompleteCardProps = {
  description: string;
  actionLabel: string;
  onCreateUpperBracket: () => void;
  className?: string;
};

/**
 * Shared Phase-2 action shown after a Top-24 playoff finishes.
 * BM, MR, and GP use different scoring forms, but this transition card has
 * the same visibility rule and action. Keeping it in one component prevents
 * copy/style drift while leaving mode-specific bracket logic in each page.
 */
export function PlayoffCompleteCard({
  description,
  actionLabel,
  onCreateUpperBracket,
  className,
}: PlayoffCompleteCardProps) {
  return (
    <Card className={className ?? "border-green-500/50 bg-green-500/10"}>
      <CardContent className="py-4 text-center">
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        <Button onClick={onCreateUpperBracket}>{actionLabel}</Button>
      </CardContent>
    </Card>
  );
}
