import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-939 tournament tab navigation', () => {
  const layoutSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'layout.tsx');

  it('keeps tournament section tabs on Next Link with prefetch disabled', () => {
    expect(layoutSource).toContain('import Link from "next/link";');
    expect(layoutSource).toContain('href={`/tournaments/${id}/${tab.href}`}');
    expect(layoutSource).toContain('prefetch={false}');
    expect(layoutSource).not.toMatch(
      /<a[\s\S]*href=\{`\/tournaments\/\$\{id\}\/\$\{tab\.href\}`\}/
    );
  });

  it('exposes a hydration signal and disables tab clicks before hydration', () => {
    expect(layoutSource).toContain('const [tabsHydrated, setTabsHydrated] = useState(false);');
    expect(layoutSource).toContain('setTabsHydrated(true);');
    expect(layoutSource).toContain('data-tournament-tabs-hydrated={tabsHydrated ? "true" : "false"}');
    expect(layoutSource).toContain('"aria-disabled": !tabsHydrated');
    expect(layoutSource).toContain('tabIndex: tabsHydrated ? undefined : -1');
    expect(layoutSource).toContain('pointer-events-none opacity-70');
  });

  it('uses conditional class merging so hydrated tabs do not keep whitespace-only guard classes', () => {
    expect(layoutSource).toContain('import { cn } from "@/lib/utils";');
    expect(layoutSource).toContain('guardClassName: !tabsHydrated && "pointer-events-none opacity-70"');
    expect(layoutSource).not.toContain('${tabsHydrated ? "" : "pointer-events-none opacity-70"}');
  });

  it('centralizes hydration guard props for normal and admin tab links', () => {
    expect(layoutSource).toContain('function getTabHydrationGuardProps(tabsHydrated: boolean)');
    expect(layoutSource).toContain('const { guardClassName, ...tabHydrationGuardProps } = getTabHydrationGuardProps(tabsHydrated);');
    expect(layoutSource.match(/\{\.\.\.tabHydrationGuardProps\}/g)).toHaveLength(2);
    expect(layoutSource.match(/aria-disabled=\{!tabsHydrated\}/g) ?? []).toHaveLength(0);
    expect(layoutSource.match(/tabIndex=\{tabsHydrated \? undefined : -1\}/g) ?? []).toHaveLength(0);
  });
});
