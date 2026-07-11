import { readRepoFile } from '../helpers/e2e-cases';
import { getTabHydrationGuardProps } from '@/lib/tournament-tab-hydration';
import { cn } from '@/lib/utils';

describe('TC-939 tournament tab navigation', () => {
  const layoutSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'layout.tsx');

  it('keeps tournament section tabs on Next Link with prefetch disabled', () => {
    expect(layoutSource).toMatch(/import Link from ['"]next\/link['"];/);
    expect(layoutSource).toContain('href={`/tournaments/${id}/${tab.href}`}');
    expect(layoutSource).toContain('prefetch={false}');
    expect(layoutSource).not.toMatch(/<a[^>]*href=\{`\/tournaments\/\$\{id\}\/\$\{tab\.href\}`\}/);
  });

  it('exposes a hydration signal and disables tab clicks before hydration', () => {
    expect(layoutSource).toContain('const [tabsHydrated, setTabsHydrated] = useState(false);');
    expect(layoutSource).toContain('setTabsHydrated(true);');
    expect(layoutSource).toMatch(/data-tournament-tabs-hydrated=\{tabsHydrated \? ['"]true['"] : ['"]false['"]\}/);
  });

  it('uses the hydration guard helper output to disable tabs before hydration', () => {
    expect(getTabHydrationGuardProps(false)).toEqual({
      'aria-disabled': true,
      tabIndex: -1,
      guardClassName: 'pointer-events-none opacity-70',
    });

    expect(getTabHydrationGuardProps(true)).toEqual({
      'aria-disabled': false,
      tabIndex: undefined,
      guardClassName: undefined,
    });
  });

  it('uses class merging behavior so hydrated tabs do not keep whitespace-only guard classes', () => {
    expect(cn('tab-base', getTabHydrationGuardProps(false).guardClassName)).toBe(
      'tab-base pointer-events-none opacity-70',
    );
    expect(cn('tab-base', getTabHydrationGuardProps(true).guardClassName)).toBe('tab-base');
  });

  it('keeps the hydration guard class value as string or undefined', () => {
    const guardPropsSource = readRepoFile('smkc-score-app', 'src', 'lib', 'tournament-tab-hydration.ts');
    expect(guardPropsSource).toContain('guardClassName: !tabsHydrated ? "pointer-events-none opacity-70" : undefined');
    expect(guardPropsSource).not.toContain('guardClassName: !tabsHydrated &&');
  });

  it('centralizes hydration guard props for normal and admin tab links', () => {
    expect(layoutSource).toContain('getTabHydrationGuardProps(tabsHydrated)');
    expect(layoutSource).toContain(
      'const { guardClassName, ...tabHydrationGuardProps } = getTabHydrationGuardProps(tabsHydrated);',
    );
    expect(layoutSource.match(/\{\.\.\.tabHydrationGuardProps\}/g) ?? []).toHaveLength(2);
    expect(layoutSource.match(/aria-disabled=\{!tabsHydrated\}/g) ?? []).toHaveLength(0);
    expect(layoutSource.match(/tabIndex=\{tabsHydrated \? undefined : -1\}/g) ?? []).toHaveLength(0);
  });
});
