import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-939 tournament tab navigation', () => {
  const layoutSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'layout.tsx');

  it('keeps tournament section tabs on Next Link with prefetch disabled', () => {
    expect(layoutSource).toContain('import Link from "next/link";');
    expect(layoutSource).toContain('href={`/tournaments/${id}/${tab.href}`}');
    expect(layoutSource).toContain('prefetch={false}');
    expect(layoutSource).not.toContain('<a\n                    href={`/tournaments/${id}/${tab.href}`}');
    expect(layoutSource).not.toContain('<a\n                      href={`/tournaments/${id}/${tab.href}`}');
  });
});
