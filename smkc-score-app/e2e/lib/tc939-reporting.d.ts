export type Tc939TabNavigationInput = {
  spaMarker: unknown;
  cleanClasses: boolean;
};

export type Tc939TabNavigationResult = {
  status: 'PASS' | 'FAIL';
  detail: string;
};

export type Tc939TabNavigationReporter = (
  input: Tc939TabNavigationInput,
) => Tc939TabNavigationResult;

export const describeTc939TabNavigation: Tc939TabNavigationReporter;
