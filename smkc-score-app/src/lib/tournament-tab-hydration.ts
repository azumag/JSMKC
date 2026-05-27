export function getTabHydrationGuardProps(tabsHydrated: boolean) {
  return {
    "aria-disabled": !tabsHydrated,
    tabIndex: tabsHydrated ? undefined : -1,
    guardClassName: !tabsHydrated ? "pointer-events-none opacity-70" : undefined,
  } as const;
}
