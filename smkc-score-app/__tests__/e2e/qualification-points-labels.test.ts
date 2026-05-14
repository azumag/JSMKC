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

  it('does not silently skip missing i18n labels', () => {
    expect(getQualificationPointsHeaderLabels()).toHaveLength(2);
    expect(getQualificationPointsHeaderLabels()).not.toContain(undefined);
    expect(getQualificationPointsTooltipTitles()).toHaveLength(2);
    expect(getQualificationPointsTooltipTitles()).not.toContain(undefined);
  });

  it('throws when a required i18n label is missing during helper initialization', () => {
    jest.isolateModules(() => {
      jest.doMock('../../messages/ja.json', () => ({
        common: {
          ...jaMessages.common,
          qualificationPointsShort: undefined,
        },
      }));
      jest.doMock('../../messages/en.json', () => enMessages);

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../e2e/lib/common');
      }).toThrow('messages/ja.json common.qualificationPointsShort is required');
    });
  });
});
