/**
 * Unit tests for getTabHydrationGuardProps (TC-2516–TC-2517).
 *
 * Returns accessibility props that disable tab interactions until the tab
 * contents have fully hydrated on the client side.
 */

import { getTabHydrationGuardProps } from '@/lib/tournament-tab-hydration';

describe('getTabHydrationGuardProps', () => {
  it('TC-2516: returns enabled props when tabsHydrated is true', () => {
    const result = getTabHydrationGuardProps(true);

    expect(result['aria-disabled']).toBe(false);
    expect(result.tabIndex).toBeUndefined();
    expect(result.guardClassName).toBeUndefined();
  });

  it('TC-2517: returns disabled props when tabsHydrated is false', () => {
    const result = getTabHydrationGuardProps(false);

    expect(result['aria-disabled']).toBe(true);
    expect(result.tabIndex).toBe(-1);
    expect(result.guardClassName).toBe('pointer-events-none opacity-70');
  });
});
