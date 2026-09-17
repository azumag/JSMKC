import fs from 'fs';
import path from 'path';

describe('TA battle royale qualification standings column contract', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx'),
    'utf8',
  );
  const start = source.indexOf('{/* Standings Tab: Ranked list of players */}');
  const end = source.indexOf('{/* Time List/Entry Tab:', start);
  const standings = source.slice(start, end);

  it('renders the conditional handicap header and matching player cell together', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(standings).toContain("{taBattleRoyaleMode && <TableHead>{t('handicap')}</TableHead>}");
    expect(standings).toContain('<TaHandicapBadge value={entry.taHandicapSeconds} />');
  });

  it('documents why the conditional row cell is required', () => {
    const docs = fs.readFileSync(path.join(process.cwd(), 'docs', 'ta-qualification-client-contract.md'), 'utf8');
    expect(docs).toContain('Every standings player row must therefore include the matching `TaHandicapBadge` cell');
    expect(docs).toContain('Standard TA keeps the original column layout');
  });
});
