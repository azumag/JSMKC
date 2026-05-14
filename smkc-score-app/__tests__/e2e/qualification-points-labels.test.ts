import jaMessages from '../../messages/ja.json';
import enMessages from '../../messages/en.json';
import {
  getQualificationPointsHeaderLabels,
  getQualificationPointsTooltipTitles,
} from '../../e2e/lib/common';

describe('qualification points E2E label source', () => {
  it('uses i18n messages as the single source for header labels', () => {
    expect(getQualificationPointsHeaderLabels()).toEqual([
      jaMessages.common.qualificationPointsShort,
      enMessages.common.qualificationPointsShort,
    ]);
  });

  it('uses i18n messages as the single source for tooltip titles', () => {
    expect(getQualificationPointsTooltipTitles()).toEqual([
      jaMessages.common.qualificationPointsTooltip,
      enMessages.common.qualificationPointsTooltip,
    ]);
  });
});
