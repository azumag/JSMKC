import fs from 'node:fs';
import path from 'node:path';

const layoutSource = fs.readFileSync(
  path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'layout.tsx'),
  'utf8',
);

describe('tournament status control contract', () => {
  it('does not offer lifecycle controls for archived fallback summaries', () => {
    expect(layoutSource).toContain('archived?: boolean');
    expect(layoutSource).toContain('canUpdateTournamentStatus(tournament)');
    expect(layoutSource).toContain("canManageStatus && tournament.status === 'completed'");
  });

  it('surfaces rejected status updates instead of silently ignoring them', () => {
    expect(layoutSource).toContain('parseTournamentStatusUpdateResponse<Tournament>(response)');
    expect(layoutSource).toContain('setStatusError(err instanceof Error ? err.message');
    expect(layoutSource).toContain('role="alert"');
  });

  it('applies the successful PUT result immediately and blocks duplicate clicks', () => {
    expect(layoutSource).toContain('setTournament(updatedTournament)');
    expect(layoutSource).toContain('if (statusUpdating || !canUpdateTournamentStatus(tournament)) return');
    expect(layoutSource).toContain('disabled={statusUpdating}');
    expect(layoutSource).toContain('aria-busy={statusUpdating}');
  });
});
