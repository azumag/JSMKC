"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SharedMatchAdminGuidanceProps {
  href: string;
  description: string;
  ctaLabel: string;
}

export function SharedMatchAdminGuidance({
  href,
  description,
  ctaLabel,
}: SharedMatchAdminGuidanceProps) {
  return (
    <Card>
      <CardContent className="py-8 text-center space-y-4">
        <p className="text-muted-foreground">{description}</p>
        <Button asChild variant="outline">
          <Link href={href}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
