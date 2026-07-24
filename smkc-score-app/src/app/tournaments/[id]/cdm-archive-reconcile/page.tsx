import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { CdmArchiveReconcileButton } from '@/components/tournament/cdm-archive-reconcile-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CdmArchiveReconciliationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user || session.user.role !== 'admin') {
    redirect(`/tournaments/${id}/ta`);
  }

  let tournamentId: string;
  try {
    tournamentId = await resolveTournamentId(id);
  } catch {
    notFound();
  }
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, slug: true, status: true, qualificationScheduleMethod: true },
  });
  if (!tournament) notFound();

  const excluded = /(^|[^a-z0-9])jsmkc([^a-z0-9]|$)/i.test(`${tournament.name} ${tournament.slug ?? ''}`);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>CDM archive schedule reconciliation</CardTitle>
        <CardDescription>
          Existing competitive match IDs, scores, reports, and audit history are preserved while qualification Day,
          player side, MR course card, and GP cup are aligned to the RR 2025 fixture.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tournament</dt>
            <dd className="font-medium">{tournament.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current schedule method</dt>
            <dd className="font-mono">{tournament.qualificationScheduleMethod}</dd>
          </div>
        </dl>
        {excluded ? (
          <p className="text-sm text-muted-foreground">JSMKC tournaments are intentionally excluded from correction.</p>
        ) : tournament.status !== 'completed' ? (
          <p className="text-sm text-muted-foreground">
            Complete and confirm the tournament before generating its archival correction.
          </p>
        ) : (
          <CdmArchiveReconcileButton
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            status={tournament.status}
          />
        )}
      </CardContent>
    </Card>
  );
}
