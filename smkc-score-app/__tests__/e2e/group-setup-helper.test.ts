import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  setupModePlayersViaUi,
} from '../../e2e/lib/common';
import {
  pageFetchJson,
} from '../../e2e/tc-all';
import {
  bmFinalsTargetWinsForMatch,
  getSuite as getBmSuite,
} from '../../e2e/tc-bm';
import {
  getSuite as getMrSuite,
  mrFinalsTargetWinsForMatch,
} from '../../e2e/tc-mr';
import {
  getSuite as getGpSuite,
  gpFinalsTargetWins,
} from '../../e2e/tc-gp';
import {
  requestKindForQualificationFetch,
} from '../../e2e/tc-archive';
import {
  countDebugFillFailures,
  taEntriesFromFetch,
} from '../../e2e/tc-debug-fill';

const GROUP_SETUP_TRIGGER_NAME_SOURCE = 'Setup Groups|Edit Groups|グループ設定|グループ編集';
const GROUP_SETUP_TRIGGER_NAME_FRAGMENT = GROUP_SETUP_TRIGGER_NAME_SOURCE.split('|')[0];

function throwUnexpectedMockCall(kind: string, actual: string, expected: string[]): never {
  throw new Error(`${kind} received unexpected value "${actual}". Expected one of: ${expected.join(', ')}`);
}

describe('group setup E2E helper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints expected mock lookups when the Playwright fixture receives an unexpected selector', () => {
    expect(() => throwUnexpectedMockCall('dialog.locator', 'section[data-new]', ['label', 'input[type="number"]']))
      .toThrow('dialog.locator received unexpected value "section[data-new]". Expected one of: label, input[type="number"]');
  });

  it('skips clicking an already-selected disabled group-count button while saving seeded groups', async () => {
    const groupCountClick = jest.fn(async () => undefined);
    const saveClick = jest.fn(async () => undefined);
    const seedFills: string[] = [];
    const selectedPlayers: string[] = [];
    const searchFill = jest.fn(async (value: string) => {
      if (value) selectedPlayers.push(value);
    });

    const removeButtons = {
      count: jest.fn(async () => 0),
      first: jest.fn(),
    };
    const groupCountButton = {
      isDisabled: jest.fn(async () => true),
      click: groupCountClick,
    };
    const seedInputs = {
      nth: jest.fn((index: number) => ({
        fill: jest.fn(async (value: string) => {
          seedFills[index] = value;
        }),
      })),
    };
    const searchInput = { fill: searchFill };
    const playerLabel = {
      waitFor: jest.fn(async () => undefined),
      getAttribute: jest.fn(async () => 'player-checkbox'),
    };
    const checkbox = {
      scrollIntoViewIfNeeded: jest.fn(async () => undefined),
      click: jest.fn(async () => undefined),
    };
    const dialog = {
      waitFor: jest.fn(async () => undefined),
      getByPlaceholder: jest.fn(() => searchInput),
      locator: jest.fn((selector: string) => {
        const expectedSelectors = ['label', 'button[id="player-checkbox"]', 'input[type="number"]'];
        if (selector === 'label') {
          return {
            filter: jest.fn(() => ({
              first: jest.fn(() => playerLabel),
            })),
          };
        }
        if (selector === 'button[id="player-checkbox"]') return checkbox;
        if (selector === 'input[type="number"]') return seedInputs;
        return throwUnexpectedMockCall('dialog.locator', selector, expectedSelectors);
      }),
      getByRole: jest.fn((_role: string, options: { name?: RegExp } = {}) => {
        const name = options.name?.source ?? '';
        const expectedNames = ['Remove', '^2$', 'Distribute by Seed', 'Create Groups'];
        if (name.includes('Remove')) return removeButtons;
        if (name === '^2$') return groupCountButton;
        if (name.includes('Distribute by Seed')) return { click: jest.fn(async () => undefined) };
        if (name.includes('Create Groups')) return { click: saveClick };
        return throwUnexpectedMockCall('dialog.getByRole name', name, expectedNames);
      }),
    };
    const page = {
      goto: jest.fn(async () => undefined),
      waitForTimeout: jest.fn(async () => undefined),
      getByRole: jest.fn((_role: string, options: { name?: RegExp } = {}) => {
        const name = options.name?.source ?? '';
        if (name.includes(GROUP_SETUP_TRIGGER_NAME_FRAGMENT)) {
          return { first: jest.fn(() => ({ click: jest.fn(async () => undefined) })) };
        }
        if (_role === 'dialog') {
          return { first: jest.fn(() => dialog) };
        }
        const expectedPageRoleLookups = [
          `role=button name=${GROUP_SETUP_TRIGGER_NAME_SOURCE}`,
          'role=dialog name=',
        ];
        return throwUnexpectedMockCall(
          'page.getByRole lookup',
          `role=${_role} name=${name}`,
          expectedPageRoleLookups,
        );
      }),
      waitForResponse: jest.fn(async () => ({ status: () => 201 })),
    };

    await setupModePlayersViaUi(page, 'bm', 'tournament-1', [
      { name: 'Player 1', nickname: 'P1' },
      { name: 'Player 2', nickname: 'P2' },
      { name: 'Player 3', nickname: 'P3' },
      { name: 'Player 4', nickname: 'P4' },
    ], { groupCount: 2 });

    expect(page.goto).toHaveBeenCalledWith(expect.stringContaining('/tournaments/tournament-1/bm'), expect.any(Object));
    expect(groupCountButton.isDisabled).toHaveBeenCalled();
    expect(groupCountClick).not.toHaveBeenCalled();
    expect(selectedPlayers).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(seedFills).toEqual(['1', '2', '3', '4']);
    expect(saveClick).toHaveBeenCalled();
  });

  it('exposes suite specs instead of requiring source scans for TC registration', () => {
    expect(getBmSuite().tests.map((testCase: { name: string }) => testCase.name))
      .toEqual(expect.arrayContaining(['TC-1010', 'TC-1052', 'TC-515', 'TC-529']));
    expect(getMrSuite().tests.map((testCase: { name: string }) => testCase.name))
      .toEqual(expect.arrayContaining(['TC-615', 'TC-820', 'TC-858']));
    expect(getGpSuite().tests.map((testCase: { name: string }) => testCase.name))
      .toEqual(expect.arrayContaining(['TC-715', 'TC-821', 'TC-831']));
  });

  it('keeps GP suite TC-831 before TC-832 for readable ordered logs', () => {
    const gpTestNames = getGpSuite().tests.map((testCase: { name: string }) => testCase.name);
    const tc831Index = gpTestNames.indexOf('TC-831');
    const tc832Index = gpTestNames.indexOf('TC-832');

    expect(tc831Index).toBeGreaterThanOrEqual(0);
    expect(tc832Index).toBeGreaterThanOrEqual(0);
    expect(tc831Index).toBeLessThan(tc832Index);
  });

  it('checks finals target-win helpers by behavior', () => {
    expect(bmFinalsTargetWinsForMatch({ round: 'winners_r1' })).toBe(5);
    expect(bmFinalsTargetWinsForMatch({ round: 'losers_r3' })).toBe(7);
    expect(bmFinalsTargetWinsForMatch({ round: 'grand_final_reset' })).toBe(7);

    expect(mrFinalsTargetWinsForMatch({ stage: 'playoff', round: 'playoff_r2' })).toBe(4);
    expect(mrFinalsTargetWinsForMatch({ round: 'losers_r4' })).toBe(7);
    expect(mrFinalsTargetWinsForMatch({ round: 'losers_sf' })).toBe(9);

    expect(gpFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })).toBe(1);
    expect(gpFinalsTargetWins({ round: 'winners_r1' })).toBe(2);
    expect(gpFinalsTargetWins({ round: 'grand_final' })).toBe(3);
  });

  it('bounds page.evaluate fetches with a synthetic failure status on browser fetch errors', async () => {
    const page = {
      evaluate: jest.fn(async (callback, payload) => callback(payload)),
    };
    const fetchError = new Error('The operation was aborted');
    fetchError.name = 'AbortError';
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      throw fetchError;
    }) as unknown as typeof fetch;

    try {
      await expect(pageFetchJson(page, '/api/tournaments/t1/overall-ranking', {}, 25))
        .resolves.toEqual({
          s: 0,
          b: {
            error: 'The operation was aborted',
            name: 'AbortError',
          },
        });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('classifies archive qualification fetches and accepts wrapped debug-fill TA data', () => {
    expect(requestKindForQualificationFetch(
      'https://preview.example.test/api/tournaments/tournament-1/bm',
      'tournament-1',
      'bm',
    )).toBe('mode');
    expect(requestKindForQualificationFetch(
      'https://preview.example.test/api/players?limit=100',
      'tournament-1',
      'bm',
    )).toBe('players');
    expect(requestKindForQualificationFetch(
      'https://preview.example.test/api/players?limit=50',
      'tournament-1',
      'bm',
    )).toBeNull();

    expect(taEntriesFromFetch({ b: { data: { entries: [{ id: 'entry-1' }] } } }))
      .toEqual([{ id: 'entry-1' }]);
    expect(taEntriesFromFetch({ entries: [{ id: 'entry-2' }] }))
      .toEqual([{ id: 'entry-2' }]);
  });

  it('counts debug-fill failures as a numeric value', () => {
    expect(countDebugFillFailures([
      { tc: 'TC-DBG-01', s: 'PASS' },
      { tc: 'TC-DBG-02', s: 'FAIL' },
      { tc: 'TC-DBG-03', status: 'FAIL' },
    ])).toBe(1);
  });
});
