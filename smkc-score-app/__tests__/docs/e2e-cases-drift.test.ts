import * as gpFinalsValidatorExports from '../../e2e/lib/gp-finals-validators';
import {
  callObjectArrayLiteralTexts,
  callObjectPropertyNames,
  callExpressionWithArguments,
  e2eCaseSection,
  readRepoFile,
  sectionBetween,
} from '../helpers/e2e-cases';

function readE2eScript(script: string) {
  return readRepoFile('smkc-score-app', 'e2e', script);
}

function readE2eLib(script: string) {
  return readRepoFile('smkc-score-app', 'e2e', 'lib', script);
}

function expectHeadingRoleOptions(source: string, method: 'getByRole' | 'queryByRole', assertions: RegExp[]) {
  const match = source.match(new RegExp(`${method}\\(\\s*["']heading["']\\s*,\\s*\\{([^}]*)\\}`));
  expect(match?.[1] ?? '').toMatch(/level:\s*1\b/);
  for (const assertion of assertions) {
    expect(match?.[1] ?? '').toMatch(assertion);
  }
}

describe('E2E case drift coverage', () => {
  const tcAll = readE2eScript('tc-all.js');
  const tcBm = readE2eScript('tc-bm.js');
  const tcMr = readE2eScript('tc-mr.js');
  const tcGp = readE2eScript('tc-gp.js');
  const tcOverlay = readE2eScript('tc-overlay.js');
  const overlayPhase = readRepoFile('smkc-score-app', 'src', 'lib', 'overlay', 'phase.ts');
  const serverRanking = readRepoFile('smkc-score-app', 'src', 'lib', 'server-ranking.ts');
  const overlayEventsRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'api',
    'tournaments',
    '[id]',
    'overlay-events',
    'route.ts',
  );
  const tc2196OverlayPhaseFormatTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'e2e',
    'tc-2196-overlay-phase-format.test.ts',
  );
  const tcDebugFill = readE2eScript('tc-debug-fill.js');
  const tcTa = readE2eScript('tc-ta.js');
  const tcTaFlow = readE2eScript('tc-ta-flow.js');
  const tc939ReportingTypes = readE2eLib('tc939-reporting.d.ts');
  const taFlowRankAssertionsTypes = readE2eLib('ta-flow-rank-assertions.d.ts');
  const gpFinalsValidators = readE2eLib('gp-finals-validators.js');
  const bmFinalsPage = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'finals', 'page.tsx');
  const tc1073Lr2Slots = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'tc-1073-16p-lr2-slots.test.ts');
  const cdmFinalsFixtureTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'e2e',
    'tc-816a-cdm-finals-fixture.test.ts',
  );
  const prismaMigrationsTest = readRepoFile('smkc-score-app', '__tests__', 'docs', 'prisma-migrations.test.ts');
  const taPhasesRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'ta',
    'phases',
    'route.test.ts',
  );
  const overlayPhaseTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'overlay',
    'phase.test.ts',
  );
  const taFinalsPhaseManagerTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'ta',
    'finals-phase-manager.test.ts',
  );
  const taCourseSelection = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-selection.ts');
  const taCourseSelectionTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'ta',
    'course-selection.test.ts',
  );
  const prismaSchema = readRepoFile('smkc-score-app', 'prisma', 'schema.prisma');
  const mrMatchRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'api',
    'tournaments',
    '[id]',
    'mr',
    'match',
    '[matchId]',
    'route.ts',
  );
  const mrReportRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'api',
    'tournaments',
    '[id]',
    'mr',
    'match',
    '[matchId]',
    'report',
    'route.ts',
  );
  const mrReportRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'mr',
    'match',
    '[matchId]',
    'report',
    'route.test.ts',
  );
  const mrStandingsAssertionsTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'e2e',
    'mr-standings-assertions.test.ts',
  );
  const gpFinalsRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'gp',
    'finals',
    'route.test.ts',
  );
  const taFinalsPage = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'ta',
    'finals',
    'page.tsx',
  );
  const taPageClient = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'ta',
    'page-client.tsx',
  );
  const taEliminationPhase = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-elimination-phase.tsx',
  );
  const taSuddenDeathPanel = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-sudden-death-panel.tsx',
  );
  const taSuddenDeathPanelTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'tournament',
    'ta-sudden-death-panel.test.tsx',
  );
  const taTimeEntryLayoutTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'ta',
    'time-entry-layout.test.ts',
  );
  const taTimeEntryRowsTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'tournament',
    'ta-time-entry-rows.test.tsx',
  );
  const qualificationFallbackTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'ui',
    'loading-skeleton.test.tsx',
  );
  const loadingSkeleton = readRepoFile('smkc-score-app', 'src', 'components', 'ui', 'loading-skeleton.tsx');
  const bmPageClient = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');
  const mrPageClient = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');
  const gpPageClient = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');
  const taQualificationPageClient = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const groupSetupHelperTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'e2e',
    'group-setup-helper.test.ts',
  );
  const exportRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'api',
    'tournaments',
    '[id]',
    'export',
    'route.ts',
  );
  const exportRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'export',
    'route.test.ts',
  );
  const tc2088BoundaryTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'e2e',
    'tc-2088-cdm-main-hub-boundary.test.ts',
  );
  const enMessages = readRepoFile('smkc-score-app', 'messages', 'en.json');
  const jaMessages = readRepoFile('smkc-score-app', 'messages', 'ja.json');
  const tc109ClassifiedRows: Array<[string, string, string]> = [
    ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
    ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/lib/e2e-browser-launch.test.ts'],
    ['TC-111', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/preview-schema-preflight.test.ts'],
    ['TC-726', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-finals-assigned-cups.test.ts'],
    ['TC-728', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-ranking.test.ts'],
    ['TC-2247', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/gp/finals/route.test.ts'],
    ['TC-1009', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts'],
    ['TC-1080', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1080-qualification-route-comment.test.ts'],
    ['TC-1088', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1088-qualification-route-comment.test.ts'],
    ['TC-1090-1091', 'n/a (static/unit coverage)', 'smkc-score-app/__tests__/static/tc-1090-1091-overall-ranking.test.ts'],
    ['TC-1451-1452', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1454-1455', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1457', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-2006-2007', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/prisma-selects.test.ts'],
    ['TC-2031', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/static/ta-time-input-props-usememo.test.ts'],
    ['TC-2034', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts'],
    ['TC-2041', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts'],
    ['TC-1528', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/e2e/ta-phase-submit-helper.test.ts'],
    ['TC-1669', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts'],
    ['TC-1671', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts'],
    ['TC-2444', 'n/a (unit coverage)', 'smkc-score-app/__tests__/components/tournament/ta-time-entry-rows.test.tsx'],
    ['TC-2446', 'n/a (unit coverage)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
    ['TC-2448', 'n/a (unit coverage)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
    ['TC-2472', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/archive/route.test.ts'],
    ['TC-2473', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/archive/route.test.ts'],
    ['TC-2474', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/archive/route.test.ts'],
    ['TC-2475', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/archive/route.test.ts'],
    ['TC-2476', 'n/a (unit/static coverage)', 'smkc-score-app/src/lib/auth.ts'],
    ['TC-2477', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/middleware.test.ts'],
    ['TC-2478', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/middleware.test.ts'],
    ['TC-2479', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/middleware.test.ts'],
    ['TC-2480', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/middleware.test.ts'],
    ['TC-2481', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/middleware.test.ts'],
    ['TC-2482', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2483', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2484', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2485', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2486', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2487', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2489', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/bm/debug-fill/route.test.ts'],
    ['TC-2490', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/mr/debug-fill/route.test.ts'],
    ['TC-2491', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/gp/debug-fill/route.test.ts'],
    ['TC-2492', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/ta/debug-fill/route.test.ts'],
    ['TC-2493', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/audit-log.test.ts'],
    ['TC-2494', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/audit-log.test.ts'],
    ['TC-2495', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/audit-log.test.ts'],
    ['TC-2496', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/audit-log.test.ts'],
    ['TC-2497', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/audit-log.test.ts'],
    ['TC-2498', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2499', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2500', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2501', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2502', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2503', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2504', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2505', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/api-auth.test.ts'],
    ['TC-2506', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/score-entry-logs/route.test.ts'],
    ['TC-2507', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/score-entry-logs/route.test.ts'],
    ['TC-2508', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/score-entry-logs/route.test.ts'],
    ['TC-2509', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/score-entry-logs/route.test.ts'],
    ['TC-2510', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2511', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2512', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2513', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2514', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2515', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2518', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/db-read-retry.test.ts'],
    ['TC-2516', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/tournament-tab-hydration.test.ts'],
    ['TC-2517', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/tournament-tab-hydration.test.ts'],
    ['TC-2519', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2520', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2521', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2522', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2523', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2524', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2525', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2526', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/api-timing.test.ts'],
    ['TC-2527', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/api-timing.test.ts'],
    ['TC-2528', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/api-timing.test.ts'],
    ['TC-2540', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2541', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/query-counter.test.ts'],
    ['TC-2542', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/api-timing.test.ts'],
    ['TC-2543', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/perf/api-timing.test.ts'],
    ['TC-2544', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2545', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2546', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2547', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2548', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2549', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2550', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2551', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2552', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2553', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2554', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/time-format.test.ts'],
    ['TC-2555', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/app/api/tournaments/[id]/overlay-events/route.test.ts'],
    ['TC-2556', 'n/a (unit/static coverage)', 'smkc-score-app/src/lib/api-factories/'],
    ['TC-2557', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2558', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2559', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2560', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2561', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2562', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2563', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2564', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2565', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2566', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-lives-replay.test.ts'],
    ['TC-2567', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-finals.test.ts'],
    ['TC-2568', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/lib/cdm-export/fill/tt-finals.test.ts'],
    ['TC-803', 'TC-318 でカバー済み', 'TC-318'],
  ];

  it.each([
    ['TC-352', tcAll],
    ['TC-356', tcAll],
    ['TC-357', tcAll],
    ['TC-702', tcGp],
    ['TC-717', tcGp],
    ['TC-722', tcGp],
    ['TC-1103', tcGp],
    ['TC-1109', tcGp],
    ['TC-1098', tcGp],
    ['TC-1106', tcGp],
    ['TC-2234', tcGp],
    ['TC-725', tcGp],
    ['TC-1087', tcGp],
    ['TC-1083', tcMr],
    ['TC-729', tcGp],
    ['TC-926', tcOverlay],
    ['TC-817', tcTa],
    ['TC-1032', tcTa],
    ['TC-1033', tcTa],
    ['TC-808A', tcTa],
    ['TC-1996', tcTa],
    ['TC-939', tcAll],
    ['TC-2070A', tcAll],
    ['TC-2070B', tcAll],
    ['TC-1010', tcBm],
    ['TC-TA-FLOW-24', tcTaFlow],
  ])('keeps %s documented and registered in its runnable E2E script', (tc, scriptSource) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain('**手順**');
    expect(section).toContain('**期待結果**');
    expect(section).toContain(`**スクリプト**:`);
    expect(scriptSource).toContain(`log('${tc}'`);
  });

  it('keeps TC-2070A failure diagnostics documented and logged', () => {
    const section = e2eCaseSection('TC-2070A');

    expect(section).toContain('hasSafeCopy');
    expect(section).toContain('hasRecoveryLinks');
    expect(tcAll).toContain('tc2070AFailures');
    expect(tcAll).toContain('hasSafeCopy=${hasSafeCopy}');
    expect(tcAll).toContain('hasRecoveryLinks=${hasRecoveryLinks}');
  });

  it('keeps TC-2070B documented with the same navigationType payload used by tc-all.js', () => {
    const section = e2eCaseSection('TC-2070B');

    expect(section).toContain("navigationType: 'navigate'");
    expect(tcAll).toContain("navigationType: 'navigate'");
  });

  const gpSuiteDefinition = sectionBetween(tcGp, '    tests: [', '    ],');

  const gpTc831Tc832OrderRationale =
    /\/\/\s*TC-831 stays before TC-832[^\n]*(?:\n\s*\/\/[^\n]*)*\n\s*\{\s*name:\s*['"]TC-831['"]\s*,\s*fn:\s*runTc831\s*\}\s*,\s*\n\s*\{\s*name:\s*['"]TC-832['"]\s*,\s*fn:\s*runTc832\s*\}/;

  it('documents why GP TC-831 stays before TC-832 in the suite order', () => {
    // Regex intent:
    // - [^\\n]* matches the first rationale comment line.
    // - (?:\\n\\s*//[^\\n]*)* allows wrapped rationale comments while rejecting code.
    // - \\s* tolerates formatting drift in whitespace between comment and suite entry.
    // - ['"] accepts either quote style around TC labels in the runner list.
    // - TC-831 and TC-832 should remain adjacent and ordered for log readability.
    // Allow multiline comment formatting drift while requiring comment -> TC-831 -> TC-832 adjacency.
    expect(tcGp).toMatch(gpTc831Tc832OrderRationale);
  });

  it('rejects non-comment code between the GP TC-831 rationale and suite entry', () => {
    const weakenedFixture = gpSuiteDefinition.replace(
      gpTc831Tc832OrderRationale,
      [
        '// TC-831 stays before TC-832 so GP suite logs show numeric progression, keeping the',
        '// CI review order easy to scan when one of them fails.',
        "      { name: 'TC-999', fn: runTc999 },",
        "      { name: 'TC-831', fn: runTc831 },",
        "      { name: 'TC-832', fn: runTc832 },",
      ].join('\n') + '\n',
    );

    expect(weakenedFixture).not.toBe(gpSuiteDefinition);
    expect(weakenedFixture).not.toMatch(gpTc831Tc832OrderRationale);
  });

  it('keeps TC-2139 documented with the TC-831 fixture-injection guard', () => {
    const section = e2eCaseSection('TC-2139');

    expect(section).toContain('fixture 注入が空振りした場合');
    expect(section).toContain('group-setup-helper.test.ts');
    expect(section).toContain('__tests__/docs/e2e-cases-drift.test.ts');
  });

  it('keeps TC-2136 documented with the finals-route dead-helper guard', () => {
    const section = e2eCaseSection('TC-2136');

    expect(section).toContain('_createMockQualification');
    expect(section).toContain('finals-route.test.ts');
    expect(section).toContain('__tests__/static/tc-2136-finals-route-dead-helper.test.ts');
  });

  it('keeps TC-2125 documented with the shared TC-939 reporter declaration', () => {
    const section = e2eCaseSection('TC-2125');

    expect(section).toContain('issue #2125');
    expect(section).toContain('tc939-reporting.d.ts');
    expect(section).toContain('Tc939TabNavigationReporter');
    expect(section).toContain('__tests__/lib/tc939-reporting.test.ts');
    expect(section).toContain('__tests__/e2e/tc-all-registration.test.ts');
    expect(tc939ReportingTypes).toContain('export type Tc939TabNavigationReporter');
    expect(tc939ReportingTypes).toContain('export const describeTc939TabNavigation');
  });

  it('keeps TC-2145 documented with the qualification-route mock-match naming guard', () => {
    const section = e2eCaseSection('TC-2145');

    expect(section).toContain('_mockMatch');
    expect(section).toContain('qualification-route.test.ts');
    expect(section).toContain('__tests__/static/tc-2145-qualification-route-mock-match-name.test.ts');
  });

  it('keeps TC-2143 documented with the positive TC-2136 static guard wording', () => {
    const section = e2eCaseSection('TC-2143');

    expect(section).toContain('has removed the unused _createMockQualification helper from finals-route.test.ts');
    expect(section).toContain('does not keep');
    expect(section).toContain('__tests__/static/tc-2136-finals-route-dead-helper.test.ts');
  });

  it('keeps TC-2263 documented with asserted archive isolation mocks', () => {
    const section = e2eCaseSection('TC-2263');
    const registrationTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'tc-all-registration.test.ts');

    expect(section).toContain('issue #2263');
    expect(section).toContain('targetPage.goto');
    expect(section).toContain('targetPage.waitForFunction');
    expect(registrationTest).toContain('expect(rootPage.goto).not.toHaveBeenCalled()');
    expect(registrationTest).toContain('expect(targetPage.goto).toHaveBeenCalledWith(');
    expect(registrationTest).toContain('expect(targetPage.waitForFunction).toHaveBeenCalledWith(');
    expect(registrationTest).toContain('.resolves.toBe(0)');
  });

  it('keeps TC-2161 aligned with preview preflight implementation coverage', () => {
    const preflight = readE2eLib('preview-schema-preflight.js');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(preflight).toContain('shouldFailOnWranglerAuthOrLogFailure');
    expect(preflight).toContain('buildWranglerAuthOrLogFailureMessage');
    expect(preflight).toContain('console.warn(message)');
    expect(preflightTest).toContain('continues preview startup on Wrangler auth and log setup failures by default');
    expect(preflightTest).toContain('keeps TC-2161 documented as non-blocking auth preflight coverage');
    expect(preflightTest).toContain('keeps Wrangler auth/log message helpers private to the preflight runner');
  });

  it('keeps TC-2333 aligned with stdout JSON CLOUDFLARE_API_TOKEN auth error classification', () => {
    const section = e2eCaseSection('TC-2333');
    const preflight = readE2eLib('preview-schema-preflight.js');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('issue #2333');
    expect(section).toContain('isWranglerStdoutAuthError');
    expect(section).toContain('__tests__/e2e/preview-schema-preflight.test.ts');
    expect(preflight).toContain('isWranglerStdoutAuthError');
    expect(preflight).toContain('CLOUDFLARE_API_TOKEN');
    expect(preflight).toContain('non-interactive environment');
    /* Flat {"error": "string"} shape removed per YAGNI (issue #2384): no real Wrangler version emits it. */
    expect(preflight).not.toContain("typeof errorField === 'string'");
    expect(section).toContain('issue #2384');
    expect(preflightTest).toContain('detects CLOUDFLARE_API_TOKEN auth error in Wrangler stdout JSON');
    expect(preflightTest).toContain('continues preview startup on Wrangler stdout JSON CLOUDFLARE_API_TOKEN auth error by default');
    expect(preflightTest).toContain('keeps TC-2333 documented as stdout JSON CLOUDFLARE_API_TOKEN auth error coverage');
  });

  it('keeps TC-2360 aligned with SingletonLock live-owner fast-fail coverage', () => {
    const section = e2eCaseSection('TC-2360');
    const commonLib = readE2eLib('common.js');
    const browserLaunchTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'e2e-browser-launch.test.ts');

    expect(section).toContain('issue #2360');
    expect(section).toContain('detectSingletonLockOwner');
    expect(section).toContain('SingletonLock');
    expect(section).toContain('__tests__/lib/e2e-browser-launch.test.ts');
    expect(commonLib).toContain('detectSingletonLockOwner');
    expect(commonLib).toMatch(/process\.kill\s*\(\s*pid\s*,\s*0\s*\)/);
    expect(browserLaunchTest).toContain('returns null when SingletonLock does not exist');
    expect(browserLaunchTest).toContain('returns alive owner when lock target process is running');
    expect(browserLaunchTest).toContain('throws with live owner PID before launching Chromium');
    expect(browserLaunchTest).toContain('keeps TC-2360 documented as SingletonLock live-owner fast-fail coverage');
  });

  it('keeps TC-2385 aligned with stdout JSON Cloudflare API 7403 auth error classification', () => {
    const section = e2eCaseSection('TC-2385');
    const preflight = readE2eLib('preview-schema-preflight.js');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('issue #2385');
    expect(section).toContain('Cloudflare API 7403');
    expect(section).toContain('isWranglerStdoutAuthError');
    expect(section).toContain('__tests__/e2e/preview-schema-preflight.test.ts');
    expect(preflight).toContain('Number(errorField?.code) === 7403');
    expect(preflight).toContain('not valid or is not authorized');
    expect(preflightTest).toContain('detects Cloudflare API 7403 authorization errors in Wrangler stdout JSON');
    expect(preflightTest).toContain('continues preview startup on Cloudflare API 7403 authorization stdout JSON by default');
    expect(preflightTest).toContain('keeps TC-2385 documented as stdout JSON Cloudflare API 7403 auth error coverage');
  });

  it('keeps TC-2236 aligned with preview admin session preflight coverage', () => {
    const section = e2eCaseSection('TC-2236');
    const runner = readE2eScript('run-preview.js');
    const runnerTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'run-preview.test.ts');

    expect(section).toContain('issue #2236');
    expect(section).toContain('/api/auth/session-status');
    expect(section).toContain('createSharedE2eFixture');
    expect(section).toContain('npm run e2e:preview:login');
    /* E2E_SKIP_PREVIEW_ADMIN_PREFLIGHT escape hatch must be documented (issue #2366). */
    expect(section).toContain('E2E_SKIP_PREVIEW_ADMIN_PREFLIGHT');
    expect(runner).toContain('assertPreviewAdminSession');
    expect(runner).toContain('E2E_SKIP_PREVIEW_ADMIN_PREFLIGHT');
    expect(runner).toContain('Preview E2E admin session preflight failed before shared fixture setup');
    expect(runner).toContain('npm run e2e:preview:login');
    expect(runnerTest).toContain('fails preview admin session preflight before fixture setup');
  });

  it('keeps TC-2427 aligned with preview browser cache self-recovery coverage', () => {
    const section = e2eCaseSection('TC-2427');
    const runner = readE2eScript('run-preview.js');
    const runnerTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'run-preview.test.ts');

    expect(section).toContain('issue #2427');
    expect(section).toContain('managed Playwright cache');
    expect(section).toContain('node e2e/install-browser.js chromium');
    expect(section).toContain('admin session preflight');
    expect(runner).toContain('isMissingPlaywrightExecutableError');
    expect(runner).toContain('installPreviewBrowser');
    expect(runner).toContain('install-browser.js');
    expect(runnerTest).toContain('bootstraps a missing managed Playwright browser once');
  });

  it('keeps TC-2207 aligned with preview schema failure pattern coverage', () => {
    const section = e2eCaseSection('TC-2207');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('issue #2207');
    expect(section).toContain('SQLITE_ERROR: missing table: GPMatch');
    expect(section).toContain('missing D1 migration detected on preview');
    expect(section).toContain('GPMatch table not found');
    expect(section).toContain('suddenDeathWinnerId column not found');
    expect(preflightTest).toContain("SQLITE_ERROR: missing table: GPMatch");
    expect(preflightTest).toContain("missing D1 migration detected on preview");
    expect(preflightTest).toContain("GPMatch table not found");
    expect(preflightTest).toContain("suddenDeathWinnerId column not found");
  });

  it('keeps TC-2202 aligned with preview preflight source-structure coverage', () => {
    const section = e2eCaseSection('TC-2202');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('issue #2202');
    expect(section).toContain('marker 欠落');
    expect(section).toContain('multiline fallback return');
    expect(preflightTest).toContain('runWranglerSchemaCheckSection');
    expect(preflightTest).toContain('loopAfterFallbackReturnPattern');
    expect(preflightTest).toContain('fails the runWranglerSchemaCheck section guard before slicing when markers drift');
    expect(preflightTest).toContain('detects multiline loop-after fallback returns in the preflight source section');
  });

  it('keeps TC-2195 aligned with the MR grand-final phase format test wording', () => {
    const section = e2eCaseSection('TC-2195');

    expect(section).toContain('issue #2195');
    expect(section).toContain('First to 9');
    expect(section).toContain('phase.test.ts');
    expect(overlayPhaseTest).toContain('returns First to 9 for MR bracket grand finals');
    expect(overlayPhaseTest).toContain('latestFinalsRound: "grand_final"');
    expect(overlayPhaseTest).toContain('getMrFinalsTargetWins({ round: "grand_final" })');
    expect(overlayPhaseTest).not.toContain('returns First to 5 for MR bracket finals');
  });

  it('keeps TC-2237 aligned with separated phase3 threshold fallback and null coverage', () => {
    const section = e2eCaseSection('TC-2237');

    expect(section).toContain('issue #2237');
    expect(section).toContain('activeCount=2');
    expect(section).toContain('activeCount=1/0');
    expect(section).toContain('finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain('falls back to activeCount-1 for activeCount=2');
    expect(taFinalsPhaseManagerTest).toContain('returns null for activeCount <= 1');
    expect(taFinalsPhaseManagerTest).not.toContain(
      'falls back to activeCount-1 when no configured threshold remains',
    );
  });

  it('keeps TC-2450 aligned with per-range getNextPhase3ResetThreshold it blocks', () => {
    const section = e2eCaseSection('TC-2450');

    expect(section).toContain('issue #1954');
    expect(section).toContain('finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain('returns 8 for activeCount above 8');
    expect(taFinalsPhaseManagerTest).toContain('returns 4 for activeCount in range (4, 8]');
    expect(taFinalsPhaseManagerTest).toContain('returns 2 for activeCount in range (2, 4]');
  });

  it('keeps TC-2104 aligned with preview preflight retry-loop coverage', () => {
    const section = e2eCaseSection('TC-2104');
    const preflight = readE2eLib('preview-schema-preflight.js');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('Unit/Structural Tests');
    expect(section).toContain('preview E2E startup guard');
    expect(section).toContain('unreachable fallback return');
    expect(section).toContain('WRANGLER_TRANSIENT_STATUS_RETRIES + 1');
    expect(preflight).toContain('attempt === WRANGLER_TRANSIENT_STATUS_RETRIES');
    expect(preflightTest).toContain('keeps runWranglerSchemaCheck free of a loop-after fallback return');
    expect(preflightTest).toContain('keeps TC-2104 documented as unreachable retry fallback coverage');
    expect(preflightTest).not.toContain('documents TC-2104 as structural preview startup coverage');
  });

  it('keeps TC-2214 aligned with TC-2104 classification assertion ownership', () => {
    const section = e2eCaseSection('TC-2214');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('issue #2214');
    expect(section).toContain('e2e-cases-drift.test.ts');
    expect(section).toContain('preview-schema-preflight.test.ts');
    expect(section).toContain('TC-2104');
    expect(preflightTest).not.toContain('Unit/Structural Tests');
    expect(preflightTest).not.toContain('preview E2E startup guard');
  });

  it('keeps TC-2218 aligned with the old TC-816 deletion note wording', () => {
    const section = e2eCaseSection('TC-2218');
    const e2eCases = readRepoFile('E2E_TEST_CASES.md');
    const renameHistory = sectionBetween(e2eCases, '**欠番 / リネーム履歴**:', '### ページ中身の確認ルール');
    const currentTc816 = e2eCaseSection('TC-816');

    expect(section).toContain('issue #2218');
    expect(section).toContain('旧 TC-816 シナリオ');
    expect(section).toContain('現行 TC-816');
    expect(section).toContain('__tests__/docs/e2e-cases-drift.test.ts');
    expect(renameHistory).toContain('旧 TC-816 シナリオは E2E テスト対象外');
    expect(renameHistory).not.toContain('TC-816 は E2E テスト対象外');
    expect(currentTc816).toContain('TA 決勝フェーズ開始済みページの初期表示で開始ボタンがちらつかない');
    expect(currentTc816).toContain('tc-ta.js TC-816');
  });

  it('keeps TC-2036 aligned with the TC ID reuse policy', () => {
    const section = e2eCaseSection('TC-2036');
    const e2eCases = readRepoFile('E2E_TEST_CASES.md');
    const reusePolicy = sectionBetween(e2eCases, '**TC ID 再利用ポリシー**:', '**欠番 / リネーム履歴**:');
    const renameHistory = sectionBetween(e2eCases, '**欠番 / リネーム履歴**:', '### ページ中身の確認ルール');
    const currentTc816 = e2eCaseSection('TC-816');

    expect(section).toContain('issue #2036');
    expect(section).toContain('TC-323');
    expect(section).toContain('TC-816');
    expect(section).toContain('__tests__/docs/e2e-cases-drift.test.ts');
    expect(reusePolicy).toContain('runnable script / log 上で既存 ID と内容衝突した番号は欠番にして再利用しない');
    expect(reusePolicy).toContain('旧 TC-xxx');
    expect(reusePolicy).toContain('script-backed coverage');
    expect(renameHistory).toContain('TC-323 は runnable script / log 上の内容衝突があったため欠番');
    expect(renameHistory).toContain('旧 TC-816');
    expect(renameHistory).toContain('TC-816 は別シナリオ');
    expect(currentTc816).toContain('tc-ta.js TC-816');
  });

  it('keeps TC-2242 aligned with PR title/diff authoring guidance', () => {
    const section = e2eCaseSection('TC-2242');
    const prTemplate = readRepoFile('.github', 'pull_request_template.md');
    const prTemplateTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'pr-template.test.ts',
    );

    expect(section).toContain('issue #2242');
    expect(section).toContain('Conventional Commits');
    expect(section).toContain('docs:');
    expect(section).toContain('test:` または `refactor:');
    expect(prTemplate).toContain('PR title and Conventional Commit type match the actual diff.');
    expect(prTemplate).toContain('Use `docs:` only when this PR changes documentation.');
    // Check actual assertion content rather than the it() description to avoid fragility from renames.
    expect(prTemplateTest).toContain("Use `test:` or `refactor:` for test-only refactors.");
  });

  it('keeps TC-2118 documented with the shared tournament-tab hydration guard', () => {
    const section = e2eCaseSection('TC-2118');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'tc-939-tournament-tabs-link.test.ts');

    expect(section).toContain('getTabHydrationGuardProps(tabsHydrated)');
    expect(section).toContain('tabHydrationGuardProps');
    expect(section).toContain('__tests__/static/tc-939-tournament-tabs-link.test.ts');
    expect(staticTest).toContain('centralizes hydration guard props for normal and admin tab links');
  });

  it('keeps TC-2122 aligned with behavior-based tournament-tab hydration guard coverage', () => {
    const section = e2eCaseSection('TC-2122');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'tc-939-tournament-tabs-link.test.ts');

    expect(section).toContain('issue #2122');
    expect(section).toContain('getTabHydrationGuardProps(false)');
    expect(section).toContain('cn()');
    expect(section).toContain('source 文字列ではなく helper 挙動');
    expect(section).toContain('src/lib/tournament-tab-hydration.ts');
    expect(staticTest).toContain('uses the hydration guard helper output to disable tabs before hydration');
    expect(staticTest).toContain('uses class merging behavior so hydrated tabs do not keep whitespace-only guard classes');
    // guardClassName string check belongs to TC-2205; omit here to avoid duplication
  });

  it('keeps TC-2204 aligned with tournament-tab positive match fallback coverage', () => {
    const section = e2eCaseSection('TC-2204');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'tc-939-tournament-tabs-link.test.ts');

    expect(section).toContain('issue #2204');
    expect(section).toContain('layoutSource.match(/\\{\\.\\.\\.tabHydrationGuardProps\\}/g)');
    expect(section).toContain('`?? []`');
    expect(section).toContain('TypeError ではなく件数差分');
    expect(section).toContain('__tests__/static/tc-939-tournament-tabs-link.test.ts');
    expect(staticTest).toContain('layoutSource.match(/\\{\\.\\.\\.tabHydrationGuardProps\\}/g) ?? []');
  });

  it('keeps TC-2205 aligned with tournament-tab guard class typing', () => {
    const section = e2eCaseSection('TC-2205');
    const helper = readRepoFile('smkc-score-app', 'src', 'lib', 'tournament-tab-hydration.ts');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'tc-939-tournament-tabs-link.test.ts');

    expect(section).toContain('issue #2205');
    expect(section).toContain('string|undefined');
    expect(section).toContain('false|string');
    expect(section).toContain('__tests__/static/tc-939-tournament-tabs-link.test.ts');
    expect(helper).toContain('guardClassName: !tabsHydrated ? "pointer-events-none opacity-70" : undefined');
    expect(staticTest).toContain('keeps the hydration guard class value as string or undefined');
  });

  it('keeps TC-2449 aligned with narrow <a> tag regex in TC-939 static test', () => {
    const section = e2eCaseSection('TC-2449');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'tc-939-tournament-tabs-link.test.ts');

    expect(section).toContain('issue #1942');
    expect(section).toContain('[^>]*');
    expect(section).toContain('tc-939-tournament-tabs-link.test.ts');
    // [^>]* constrains the <a> match to within a single opening tag
    expect(staticTest).toContain('<a[^>]*href=');
    // [\s\S]* would match across tag boundaries — must not regress
    expect(staticTest).not.toContain('<a[\\s\\S]*href=');
  });

  it('keeps TC-2185 aligned with TC-939 null marker reporting coverage', () => {
    const section = e2eCaseSection('TC-2185');
    const libTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'tc939-reporting.test.ts');

    expect(section).toContain('issue #2185');
    expect(section).toContain('spaMarker: null');
    expect(section).toContain('cleanClasses: false');
    expect(section).toContain('__tests__/lib/tc939-reporting.test.ts');
    expect(libTest).toContain('reports null SPA markers as full reload failures with className detail');
    expect(libTest).toContain('spaMarker: null');
    expect(libTest).toContain('Tab click caused a full document reload / Hydrated tab className contains extra whitespace');
  });

  it('keeps TC-830 aligned with runtime unit and bracket component coverage', () => {
    const section = e2eCaseSection('TC-830');
    const pageWiringTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'tournaments', 'gp-finals-page-wiring.test.tsx');
    const winnerHelperTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'gp-finals-match-winner.test.ts');
    const doubleBracketTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'double-elimination-bracket.test.tsx',
    );
    const playoffBracketTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-bracket.test.tsx',
    );

    expect(section).toContain('issue #830');
    expect(section).toContain('gp-finals-page-wiring.test.tsx');
    expect(section).toContain('gp-finals-match-winner.test.ts');
    expect(section).toContain('double-elimination-bracket.test.tsx');
    expect(section).toContain('playoff-bracket.test.tsx');
    expect(pageWiringTest).toContain('passes the GP legacy winner resolver into the finals bracket');
    expect(winnerHelperTest).toContain('falls back to suddenDeathWinnerId for completed legacy tied rows');
    expect(doubleBracketTest).toContain('uses getWinnerId for completed tied matches');
    expect(playoffBracketTest).toContain('uses getWinnerId for completed tied matches');
    expect(tcGp).not.toMatch(/\{\s*name:\s*['"]TC-830['"]/);
  });

  it('keeps TC-2252 naming tied to incomplete GP finals sudden-death saves', () => {
    const section = e2eCaseSection('TC-2252');
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'app',
      'api',
      'tournaments',
      '[id]',
      'gp',
      'finals',
      'route.test.ts',
    );

    expect(section).toContain('issue #2252');
    expect(section).toContain('completed=false');
    expect(section).toContain('unmatched/player1/player2');
    expect(section).toContain('suddenDeathWinnerId');
    expect(routeTest).toContain('while the match is incomplete, even when player1 is named');
    expect(routeTest).toContain('while the match is incomplete, even when player2 is named');
    expect(routeTest).toContain('while the match is incomplete, even when unmatched');
  });

  it('keeps TC-356 scoped to the GP finals dialog and failing on mobile layout regressions', () => {
    const section = e2eCaseSection('TC-356');
    const tc356Block = sectionBetween(tcAll, '// TC-356:', '// TC-357:');

    expect(section).toContain('ダイアログ幅内に収まる');
    expect(tc356Block).toContain("const dialog = document.querySelector('[role=\"dialog\"]')");
    expect(tc356Block).toContain('dialog.querySelector(\'#gp-finals-simple-score1\')');
    expect(tc356Block).toContain('dialog.querySelector(\'#gp-finals-simple-score2\')');
    expect(tc356Block).toContain("log('TC-356', mobileLayoutUsable ? 'PASS' : 'FAIL'");
    expect(tc356Block).not.toContain("log('TC-356', hasScrollWrapper ? 'PASS' : 'SKIP'");
    expect(tc356Block).not.toContain('document.querySelector("div.overflow-x-auto")');
  });

  it('keeps TC-357 checking exact mode-title h1 fallback and client loading headings', () => {
    const section = e2eCaseSection('TC-357');
    const tc357Block = sectionBetween(tcAll, '// TC-357:', '// TC-104:');

    expect(section).toContain('`h1` を即時確認する');
    expect(section).toContain('`domcontentloaded` 直後に確認する');
    expect(section).toContain('`バトルモード` または `Battle Mode`');
    expect(section).toContain('`マッチレース` または `Match Race`');
    expect(section).toContain('`グランプリ` または `Grand Prix`');
    expect(section).toContain('`タイムアタック` / `Time Attack` / `Time Trial`');
    expect(qualificationFallbackTest).toContain('QualificationFallback');
    expect(qualificationFallbackTest).toContain('QualificationClientLoadingState');
    expectHeadingRoleOptions(qualificationFallbackTest, 'getByRole', [/name:\s*["']グランプリ["']/]);
    expect(qualificationFallbackTest).toContain("name: 'バトルモード'");
    expectHeadingRoleOptions(qualificationFallbackTest, 'queryByRole', []);
    expect(qualificationFallbackTest).toContain('title=""');
    expect(tc357Block).toContain("waitUntil: 'domcontentloaded'");
    expect(tc357Block).toContain("page.goto(`${BASE}/tournaments/${TID}/${mode}`");
    expect(tc357Block).not.toContain("await nav(page, `/tournaments/${TID}/${mode}`)");
    expect(tc357Block).toContain("document.querySelectorAll('h1')");
    expect(tc357Block).not.toContain("document.querySelectorAll('h1, h2, h3')");
    expect(tc357Block).toContain("bm: ['バトルモード', 'Battle Mode']");
    expect(tc357Block).toContain("mr: ['マッチレース', 'Match Race']");
    expect(tc357Block).toContain("gp: ['グランプリ', 'Grand Prix']");
    expect(tc357Block).toContain("ta: ['タイムアタック', 'Time Attack', 'Time Trial']");
  });

  it('documents and guards TC-2094 TA loading skeleton action placeholder opt-out', () => {
    const section = e2eCaseSection('TC-2094');
    const tc2094Block = sectionBetween(tcAll, '// TC-2094:', '// TC-104:');

    expect(section).toContain('TA qualification page header has no first-load action button');
    expect(section).toContain('showActionButton={false}');
    expect(section).toContain('qualification-action-skeleton');
    expect(loadingSkeleton).toContain('showActionButton = true');
    expect(loadingSkeleton).toContain('qualification-action-skeleton');
    expect(qualificationFallbackTest).toContain('renders the action-button placeholder by default');
    expect(qualificationFallbackTest).toContain('can omit the action-button placeholder for TA loading');
    expect(taPageClient).toContain('showActionButton={false}');
    expect(tc2094Block).toContain("fs.readFileSync('src/components/ui/loading-skeleton.tsx'");
    expect(tc2094Block).toContain("fs.readFileSync('src/app/tournaments/[id]/ta/page-client.tsx'");
    expect(tc2094Block).toContain('otherModesUseDefault2094');
    expect(tc2094Block).toContain("'TC-2094'");
  });

  it('documents TC-2095 as shared qualification loading skeleton width coverage', () => {
    const section = e2eCaseSection('TC-2095');

    expect(section).toContain('issue #2095');
    expect(section).toContain('titleSkeletonClassName');
    expect(section).toContain('w-48');
    expect(section).toContain('__tests__/components/ui/loading-skeleton.test.tsx');
    expect(loadingSkeleton).toContain('titleSkeletonClassName = "w-48"');
    expect(qualificationFallbackTest).toContain('uses the qualification page title skeleton width by default');
    for (const pageClient of [bmPageClient, mrPageClient, gpPageClient]) {
      expect(pageClient).toContain("<QualificationClientLoadingState title={t('title')} />");
      expect(pageClient).not.toContain('titleSkeletonClassName="w-48"');
    }
    expect(taQualificationPageClient).toContain("<QualificationClientLoadingState title={t('title')} showActionButton={false} />");
    expect(taQualificationPageClient).not.toContain('titleSkeletonClassName="w-48"');
  });

  it('documents TC-2401 Skeleton accessibility contract — role and aria-label are not overridable by callers', () => {
    const section = e2eCaseSection('TC-2401');

    expect(section).toContain('issue #2343');
    expect(section).toContain('role="status"');
    expect(section).toContain('aria-label');
    expect(section).toContain('data-testid="title-skeleton"');
    // Skeleton props spread must come before role/aria-label so callers cannot override them
    expect(loadingSkeleton).toContain('{...props}');
    expect(loadingSkeleton).toMatch(/\{\.\.\.props\}[\s\S]{0,20}role="status"/);
    expect(loadingSkeleton).toMatch(/\{\.\.\.props\}[\s\S]{0,50}aria-label="Loading content"/);
    // SkeletonProps must not redundantly declare className (HTMLAttributes already provides it)
    expect(loadingSkeleton).not.toContain('interface SkeletonProps');
    expect(loadingSkeleton).toContain('type SkeletonProps');
    // title-skeleton testid must exist in QualificationClientLoadingState
    expect(loadingSkeleton).toContain('data-testid="title-skeleton"');
    // Unit tests must cover the accessibility contract
    expect(qualificationFallbackTest).toContain('TC-2401');
    expect(qualificationFallbackTest).toContain('always renders with role="status" even when caller passes a different role');
    expect(qualificationFallbackTest).toContain('always renders with aria-label even when caller passes a different aria-label');
    expect(qualificationFallbackTest).toContain('getByTestId(\'title-skeleton\')');
  });

  it('documents TC-816A as CDM finals native bracket coordinate coverage', () => {
    const section = e2eCaseSection('TC-816A');
    const cdmConstants = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'cdm-constants.ts');
    const finalsFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'finals.ts');

    expect(section).toContain('issue #816');
    expect(section).toContain('FINALS_BRACKET_SLOTS');
    expect(section).toContain('native bracket coordinates');
    // The bracket geometry table moved to cdm-constants.ts; the fill map resolves
    // each round through it. The route no longer carries the old slot helpers.
    expect(cdmConstants).toContain('FINALS_BRACKET_SLOTS');
    expect(cdmConstants).toContain('playoff_r1');
    expect(cdmConstants).toContain('winners_r1');
    expect(cdmConstants).toContain('losers_final');
    expect(finalsFill).toContain('function normalizeRound');
    expect(finalsFill).toContain('FINALS_BRACKET_SLOTS');
    expect(exportRoute).not.toContain('cdmFinalsSlotRound');
    expect(exportRoute).not.toContain('cdmFinalsSlotForMatch');
    expect(exportRoute).not.toContain('cdmFinalsMatchLabel');
    // The E2E script (tc-all.js) reads the exported workbook and keeps its own slot
    // table synchronized with cdm-constants.ts. After the ZIP-surgery rewrite it
    // verifies the structural parts the old exporter destroyed plus the input cells
    // the new exporter writes at native coordinates (seed numbers, written names,
    // completed-match scores, BM/MR seed list) — it no longer reads label/cup cells.
    expect(tcAll).toContain('TC-816A');
    expect(tcAll).toContain('CDM_FINALS_E2E_SLOTS');
    expect(tcAll).toContain('XLSX.read(Buffer.from(exportResp.bytes)');
    expect(tcAll).toContain('cellFormula: true');
    expect(tcAll).toContain('cdmE2eStructuralFailures');
    expect(tcAll).toContain("require('fflate')");
    expect(tcAll).toContain("xl/tables/table1.xml");
    expect(tcAll).toContain('xl/richData/rdrichvalue.xml');
    expect(tcAll).toContain('xl/calcChain.xml');
    expect(tcAll).toContain('fullCalcOnLoad="1"');
    expect(tcAll).toContain('cdmE2eIsWrittenValue');
    expect(tcAll).toContain('cdmE2eSeedListSet');
    expect(tcAll).toContain('checkedByMode');
    expect(tcAll).toContain('ensureCdmE2eFinalsFixture');
    expect(tcAll).toContain("if (missingModes.has('BM')) generators.push({ mode: 'BM'");
    expect(tcAll).toContain("if (missingModes.has('MR')) generators.push({ mode: 'MR'");
    expect(tcAll).toContain('cdmE2eFinalsReadinessSummary');
    // The old label/cup-summary reads are gone (route no longer writes them).
    expect(tcAll).not.toContain('cdmE2eMatchLabel');
    expect(tcAll).not.toContain('cdmE2eGpCupResultsSummary');
    expect(tcAll).not.toContain('slot.blockStart + 5');
    expect(section).toContain('mode 別 match count と round 一覧');
    expect(section).toContain('__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts');
    // The unit test now decodes the real .xlsm and checks typed seed + score cells.
    expect(cdmFinalsFixtureTest).toContain("} from '../../e2e/tc-all';");
    expect(cdmFinalsFixtureTest).not.toContain("import * as tcAllExports from '../../e2e/tc-all';");
    expect(exportRouteTest).toContain('should place CDM finals seeds and scores in native bracket coordinates');
    expect(exportRouteTest).toContain("workbook.Sheets['BM Finals']");
    expect(exportRouteTest).toContain('sheet.S5.v');
    expect(exportRouteTest).toContain('sheet.V5.v');
    expect(exportRouteTest).toContain("workbook.Sheets['GP Finals'].S5.v");
  });

  it('documents CDM export row-cap coverage for Main Hub and TT Qualifications', () => {
    const mainHubSection = e2eCaseSection('TC-2089A');
    const ttQualificationsSection = e2eCaseSection('TC-2180A');
    const cdmConstants = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'cdm-constants.ts');

    expect(mainHubSection).toContain('issue #2089/#2092/#2093');
    expect(mainHubSection).toContain('B62〜L62');
    expect(mainHubSection).toContain('B61/C61');
    expect(mainHubSection).toContain('__tests__/app/api/tournaments/[id]/export/route.test.ts');
    expect(ttQualificationsSection).toContain('issue #2180');
    expect(ttQualificationsSection).toContain('E62〜Z62');
    expect(ttQualificationsSection).toContain('E61/F61');
    expect(ttQualificationsSection).toContain('__tests__/app/api/tournaments/[id]/export/route.test.ts');
    // The Main Hub caps at 60 rows; TT Qualifications caps at its own 47-row table.
    expect(cdmConstants).toContain('MAIN_HUB_MAX_PLAYERS = 60');
    expect(cdmConstants).toContain('TT_QUAL_MAX_PLAYERS = 47');
    expect(exportRouteTest).toContain('should cap Main Hub player rows at 60 when more players are provided');
    expect(exportRouteTest).toContain('should cap TT Qualifications rows at 60 when more entries are provided');
    // Row-62 protection is now "the fixed table never addresses row 62", verified
    // by decoding the real .xlsm and asserting the row-62 cells stay undefined.
    expect(exportRouteTest).toContain('KEEP-OUT-OF-BOUNDS');
    expect(exportRouteTest).not.toContain('KEEP-OUT-BOUNDS');
    expect(exportRouteTest).toContain('ttBoundaryColumns');
    expect(exportRouteTest).toContain('`${column}62`]).toBeUndefined()');
    expect(exportRouteTest).toContain('`${col}62`]).toBeUndefined()');
  });

  it('documents TC-808A as TA TV3/TV4 broadcast warning coverage', () => {
    const section = e2eCaseSection('TC-808A');

    expect(section).toContain('issue #808');
    expect(section).toContain('#1897');
    expect(section).toContain('TV3/TV4');
    expect(tcTa).toContain('runTc808A');
    expect(tcTa).toContain('ta-tv-select-${tv3Player.id}');
    expect(tcTa).toContain('request.postDataJSON()');
    expect(tcTa).toContain('broadcastNameFields');
    expect(tcTa).toContain('Object.entries(payload).filter(([key]) => /^player\\d+Name$/.test(key))');
    expect(tcTa).toContain('Object.values(broadcastNameFields).every((name) =>');
    expect(tcTa).toContain('name !== tv3Player.nickname');
    expect(tcTa).toContain('name !== tv4Player.nickname');
    expect(jaMessages).toContain('TV3/TV4 のプレイヤーは配信に反映されません');
    expect(enMessages).toContain('TV3/TV4 players are not reflected in the broadcast');
    for (const source of [taPageClient, taFinalsPage, taEliminationPhase]) {
      expect(source).toContain('hasUnbroadcastedTvAssignment');
      expect(source).toContain('broadcastTv12Only');
    }
  });

  it('documents TC-1877A as reachable grand-final reset alias coverage', () => {
    const section = e2eCaseSection('TC-1877A');
    const finalsFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'finals.ts');

    expect(section).toContain('issue #1877');
    expect(section).toContain('bracketPosition.includes("reset")');
    expect(section).toContain('normalizeRound');
    // Round normalization moved into the finals fill map's normalizeRound.
    expect(finalsFill).toContain('if (bracketPosition.includes("reset")) return "grand_final_reset"');
    expect(finalsFill).not.toContain('round === "grand_final_reset" || bracketPosition.includes("reset")');
    expect(exportRoute).not.toContain('function cdmFinalsSlotRound');
  });

  it('documents TC-1878A as unmappable-round skip coverage', () => {
    const section = e2eCaseSection('TC-1878A');
    const finalsFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'finals.ts');

    expect(section).toContain('issue #1878');
    expect(section).toContain('zz_custom_showmatch');
    expect(section).toContain('skip');
    // No positional fallback: an unmapped round returns null and is skipped.
    expect(finalsFill).toContain('return null; // unmapped: caller skips');
    expect(exportRoute).not.toContain('isFallback: true');
    expect(exportRouteTest).toContain('should skip an unknown CDM finals round instead of using a fallback slot');
    expect(exportRouteTest).toContain('zz_custom_showmatch');
  });

  it('documents TC-1879A as E2E slot table synchronization coverage', () => {
    const section = e2eCaseSection('TC-1879A');

    expect(section).toContain('issue #1879');
    expect(section).toContain('FINALS_BRACKET_SLOTS');
    // The production slot table moved to cdm-constants.ts (the old route.ts
    // CDM_FINALS_BRACKET_SLOTS was deleted in the rewrite); the E2E sync comment
    // now points there.
    expect(tcAll).toContain('Keep this expectation map synchronized with src/lib/cdm-export/cdm-constants.ts');
    expect(tcAll).toContain('FINALS_BRACKET_SLOTS');
    expect(tcAll).not.toContain('route.ts CDM_FINALS_BRACKET_SLOTS');
    expect(tcAll).toContain('XLSX.read(Buffer.from(exportResp.bytes)');
  });

  it('documents TC-1880A as score-cell completion-gated E2E coverage', () => {
    const section = e2eCaseSection('TC-1880A');

    expect(section).toContain('issue #1880');
    // The GP cup-summary cell no longer exists in the rewritten exporter, so the
    // old gpCupResultsChecked gate is gone. Its surviving intent — a freshly
    // generated bracket with no completed match must not false-fail — now lives in
    // the completion-gated score check plus the always-written seed-number / seed-
    // list anchors that keep every mode at >=1 check.
    expect(section).toContain('completed');
    expect(tcAll).not.toContain('gpCupResultsChecked');
    expect(tcAll).not.toContain('GP cupResults not available; skipped summary-cell check');
    expect(tcAll).toContain('if (match.completed)');
    expect(tcAll).toContain('structuralFailures.length === 0 && checked > 0 && missingModes.length === 0 && failures.length === 0');
  });

  it('documents CDM E2E finals readiness parallel fetch and generator diagnostics', () => {
    const parallelSection = e2eCaseSection('TC-2098A');
    const roundSection = e2eCaseSection('TC-2099A');
    const generatorSection = e2eCaseSection('TC-2182A');
    const generatorStringSection = e2eCaseSection('TC-2186A');
    const publicApiSection = e2eCaseSection('TC-2187A');

    expect(parallelSection).toContain('issue #2098');
    expect(parallelSection).toContain('Promise.all');
    expect(parallelSection).toContain('BM の fetch promise を保留しても MR/GP fetch が即時開始');
    expect(roundSection).toContain('issue #2099/#2100');
    expect(roundSection).toContain('.filter(Boolean)');
    expect(generatorSection).toContain('issue #2182');
    expect(generatorSection).toContain('CDM finals fixture generation failed');
    expect(generatorStringSection).toContain('issue #2186');
    expect(generatorStringSection).toContain('HTTP 500: Internal Server Error');
    expect(publicApiSection).toContain('issue #2187');
    expect(publicApiSection).toContain('公開 API を最小化');
    expect(tcAll).toContain('async function fetchCdmE2eModeStates');
    expect(tcAll).toContain('const [bmState, mrState, gpState] = await Promise.all([');
    expect(tcAll).not.toContain("state: await apiFetchBmFinalsState(page, tournamentId)");
    expect(tcAll).toContain('function cdmE2eFinalsSlotMatches');
    expect(tcAll).toContain('slotMatches.map(({ slotRound }) => slotRound)');
    expect(tcAll).not.toContain('matches.map((match) => cdmE2eSlotRound(match)).filter(Boolean)');
    expect(tcAll).toContain('function assertCdmE2eGeneratorResults');
    expect(tcAll).toContain('CDM finals fixture generation failed');
    const tcAllExports = sectionBetween(tcAll, 'module.exports = {', '};');
    expect(tcAllExports).not.toContain('fetchCdmE2eModeStates');
    expect(tcAllExports).not.toContain('generateCdmE2eMissingFinals');
    expect(tcAllExports).toContain('ensureCdmE2eFinalsFixture');
    expect(cdmFinalsFixtureTest).toContain('fetches mode readiness states in parallel');
    expect(cdmFinalsFixtureTest).toContain('reports failed finals generator status');
    expect(cdmFinalsFixtureTest).toContain('reports primitive string finals generator bodies without JSON quotes');
    expect(cdmFinalsFixtureTest).toContain('keeps internal fixture helpers out of the tc-all public test API');
  });

  it('documents TC-817B as CSV/CDM export include split coverage', () => {
    const section = e2eCaseSection('TC-817B');

    expect(section).toContain('issue #817');
    expect(section).toContain('mrQualifications');
    expect(section).toContain('playerScores');
    expect(section).toContain('route.test.ts');
    expect(exportRoute).toContain('BASE_EXPORT_INCLUDE');
    expect(exportRoute).toContain('CDM_EXPORT_INCLUDE');
    expect(exportRoute).toContain('include: CDM_EXPORT_INCLUDE');
    expect(exportRoute).toContain('include: BASE_EXPORT_INCLUDE');
    expect(exportRouteTest).toContain('should export tournament data with summary section');
    expect(exportRouteTest).toContain('should export a populated CDM macro workbook when requested');
    expect(exportRouteTest).toContain('ttPhaseRounds: true');
    // The CDM include carries MR/GP qualification seeds and TT phase rounds, but
    // NOT playerScores: the Overall Ranking sheet is formula-driven and the
    // rewritten exporter never writes it (design §3.6).
    expect(exportRoute).not.toContain('playerScores: { include:');
    expect(exportRouteTest).not.toContain('playerScores: { include: { player: { select: PLAYER_PUBLIC_SELECT } } }');
  });

  it('documents TC-818A as cdm-export module time-conversion coverage', () => {
    const section = e2eCaseSection('TC-818A');
    const timeFormat = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'time-format.ts');
    const ttQualFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'tt-qualifications.ts');

    expect(section).toContain('issue #818');
    expect(section).toContain('timeValueForCDM');
    expect(section).toContain('timeStringToCdmTime');
    // The route no longer owns any time conversion; it delegates to the module.
    expect(exportRoute).not.toContain('function timeValueForCDM');
    expect(exportRoute).not.toContain('function parseTimeMs');
    expect(timeFormat).toContain('export function timeStringToCdmTime');
    expect(ttQualFill).toContain('timeStringToCdmTime(times[course])');
  });

  it('documents TC-819A as CDM template coordinate comment coverage', () => {
    const section = e2eCaseSection('TC-819A');
    const cdmConstants = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'cdm-constants.ts');
    const mainHubFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'main-hub.ts');

    expect(section).toContain('issue #819');
    expect(section).toContain('cdm-constants.ts');
    expect(section).toContain('TT_FINALS_*');
    // The template coordinates moved to cdm-constants.ts with verification comments.
    expect(cdmConstants).toContain('template coordinates');
    expect(cdmConstants).toContain('verified against a full cell dump');
    expect(cdmConstants).toContain('MAIN_HUB_MAX_PLAYERS');
    expect(cdmConstants).toContain('TT_QUAL_MAX_PLAYERS');
    expect(cdmConstants).toContain('QUAL_BLOCK_MAX_BLOCKS');
    expect(cdmConstants).toContain('FINALS_BRACKET_SLOTS');
    expect(cdmConstants).toContain('TT_FINALS_MAX_ROUNDS');
    // A fill module actually consumes the named constants.
    expect(mainHubFill).toContain('MAIN_HUB_MAX_PLAYERS');
    // The route no longer carries any CDM coordinate constants.
    expect(exportRoute).not.toContain('CDM_TT_ROUND_START_COLUMNS');
    expect(exportRoute).not.toContain('CDM_PLAYER_HUB_MAX_PLAYERS');
  });

  it('documents TC-1871A as TT Qualifications sheet-specific range names', () => {
    const section = e2eCaseSection('TC-1871A');
    const cdmConstants = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'cdm-constants.ts');
    const ttQualFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'tt-qualifications.ts');

    expect(section).toContain('issue #1871');
    expect(section).toContain('TT_QUAL_FIRST_ROW');
    expect(section).toContain('TT_QUAL_MAX_PLAYERS');
    expect(cdmConstants).toContain('TT_QUAL_FIRST_ROW');
    expect(cdmConstants).toContain('TT_QUAL_MAX_PLAYERS');
    expect(cdmConstants).toContain('TT_QUAL_FIRST_TIME_COLUMN');
    // The fill module clears/slices using the TT-specific constants.
    expect(ttQualFill).toContain('TT_QUAL_FIRST_ROW + TT_QUAL_MAX_PLAYERS');
    expect(ttQualFill).toContain('.slice(0, TT_QUAL_MAX_PLAYERS)');
  });

  it('documents TC-1872A as finals and TT round coordinate constants', () => {
    const section = e2eCaseSection('TC-1872A');
    const cdmConstants = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'cdm-constants.ts');
    const finalsFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'finals.ts');
    const ttFinalsFill = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'fill', 'tt-finals.ts');

    expect(section).toContain('issue #1872');
    expect(section).toContain('FINALS_*');
    expect(section).toContain('TT_FINALS_*');
    expect(cdmConstants).toContain('FINALS_SEED_LIST_COLUMN');
    expect(cdmConstants).toContain('FINALS_BLOCK_SEED_OFFSET');
    expect(cdmConstants).toContain('FINALS_BLOCK_SCORE_OFFSET');
    expect(cdmConstants).toContain('TT_FINALS_ROUND_STRIDE');
    expect(cdmConstants).toContain('TT_FINALS_INPUT_FIRST_COLUMN');
    expect(cdmConstants).toContain('TT_FINALS_DISPLAY_FIRST_COLUMN');
    expect(finalsFill).toContain('FINALS_BLOCK_SCORE_OFFSET');
    expect(ttFinalsFill).toContain('TT_FINALS_ROUND_STRIDE');
  });

  it('documents TC-1874A as patcher formula-cell protection coverage', () => {
    const section = e2eCaseSection('TC-1874A');
    const patcher = readRepoFile('smkc-score-app', 'src', 'lib', 'cdm-export', 'sheet-xml-patcher.ts');

    expect(section).toContain('issue #1874');
    expect(section).toContain('#SPILL!');
    expect(section).toContain('sheet-xml-patcher.ts');
    // The patcher refuses to write a value over a formula cell (no more #SPILL!).
    expect(patcher).toContain('refusing to write a value over the formula cell');
    // The old width-named coordinate constants are gone from the route.
    expect(exportRoute).not.toContain('CDM_FINALS_BLOCK_WIDTH');
    expect(exportRoute).not.toContain('CDM_TT_ROUND_BLOCK_WIDTH');
    expect(exportRoute).not.toContain('CDM_FINALS_BLOCK_END_OFFSET');
  });

  it('keeps TC-2088 aligned with AST-backed Main Hub boundary coverage', () => {
    const section = e2eCaseSection('TC-2088');

    expect(section).toContain('issue #2088/#2193');
    expect(section).toContain('TypeScript AST');
    expect(section).toContain('tc-2088-cdm-main-hub-boundary.test.ts');
    // Check AST behavior targets rather than function names to avoid fragility on renames (#2354).
    expect(tc2088BoundaryTest).toContain("'Array.from'");        // AST detects Array.from({ length: 60 }) call
    expect(tc2088BoundaryTest).toContain("'Main Hub'");          // AST detects Main Hub cell boundary access
    expect(tc2088BoundaryTest).toContain('ts.forEachChild');     // AST traversal approach still in use
    expect(tc2088BoundaryTest).not.toContain("toContain('Array.from({ length: 60 }')");
    expect(tc2088BoundaryTest).not.toContain('B62).toBeUndefined()');
    expect(exportRouteTest).toContain('should write the Main Hub player rows for exactly 60 players');
  });

  it('keeps TC-1010 aligned with the BM 16-player finals regression coverage', () => {
    const section = e2eCaseSection('TC-1010');
    const finalsRouteTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );
    const overallRankingTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );

    expect(section).toContain('issue #1010');
    expect(section).toContain('rankOverride');
    expect(section).toContain('losers_r4');
    expect(section).toContain('losers_r3');
    expect(section).toContain('E2E_TESTS=TC-1010 node e2e/tc-bm.js');
    expect(tcBm).toContain("{ name: 'TC-1010', fn: runTc1010 }");
    expect(finalsRouteTest).toContain('uses finalized qualification ranks when seeding the bracket');
    expect(overallRankingTest).toContain('maps 16-player finals and Top24 playoff losses to standard point bands');
  });

  it('keeps TC-2334 aligned with the BM duplicate rankOverride collision coverage', () => {
    const section = e2eCaseSection('TC-2334');
    const finalsRouteTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );

    expect(section).toContain('issue #2357');
    expect(section).toContain('rankOverride');
    expect(section).toContain('rankOverrideAt');
    expect(section).toContain('E2E_TESTS=TC-2334 node e2e/tc-bm.js');
    expect(tcBm).toContain("{ name: 'TC-2334', fn: runTc2334 }");
    expect(finalsRouteTest).toContain('uses the latest manual rankOverride when duplicate override ranks collide');
    expect(finalsRouteTest).toContain('falls back to latest rankOverrideAt timestamp when both players share the same rankOverride value');
    expect(finalsRouteTest).toContain('sorts by rankOverride value ascending when both players have rankOverride set (score/points tied)');
  });

  it('keeps TC-1007 aligned with the GroupSetupDialog static guard', () => {
    const section = e2eCaseSection('TC-1007');
    const followupSection = e2eCaseSection('TC-1678');
    const disabledButtonSection = e2eCaseSection('TC-1680');
    const secondaryButtonSection = e2eCaseSection('TC-1682');
    const helperAliasSection = e2eCaseSection('TC-1980-1982');
    const helperAliasGuardSection = e2eCaseSection('TC-2012');
    const helperAliasCallGuardSection = e2eCaseSection('TC-2014');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1007-group-setup-dialog-prop-contract.test.ts',
    );

    expect(section).toContain('issue #1007');
    expect(section).toContain('GroupSetupDialog');
    expect(section).toContain('tc-1007-group-setup-dialog-prop-contract.test.ts');
    expect(followupSection).toContain('issue #1678');
    expect(followupSection).toContain('setGroupCount');
    expect(disabledButtonSection).toContain('issue #1680');
    expect(disabledButtonSection).toContain('disabled');
    expect(secondaryButtonSection).toContain('issue #1682');
    expect(secondaryButtonSection).toContain('variant="secondary"');
    expect(helperAliasSection).toContain('issue #1980 / #1982');
    expect(helperAliasSection).toContain('EXPECTED_PAGE_ROLE_LOOKUPS');
    expect(helperAliasGuardSection).toContain('issue #2012');
    expect(helperAliasGuardSection).toContain('空白依存');
    expect(helperAliasCallGuardSection).toContain('issue #2014');
    expect(helperAliasCallGuardSection).toContain('同一の `throwUnexpectedMockCall(...)` 呼び出し');
    expect(groupSetupHelperTest).not.toContain('const expectedPageRoleLookups');
    expect(groupSetupHelperTest).not.toContain('const actualPageRoleLookup');
    // Throwing on not-found is the assertion — the return value always contains the required args
    callExpressionWithArguments(groupSetupHelperTest, 'throwUnexpectedMockCall', [
      "'page.getByRole'",
      'roleLookup(_role, name)',
      'EXPECTED_PAGE_ROLE_LOOKUPS',
    ]);
    expect(guard).toContain("e2eCaseSection('TC-1007')");
    expect(guard).toContain("e2eCaseSection('TC-1678')");
    expect(guard).toContain("not.toContain('groupCount={groupCount}')");
    expect(guard).toContain("not.toContain('setGroupCount={setGroupCount}')");
    expect(guard).toContain("expect(groupCountButton).toContain('disabled')");
    expect(guard).toContain('expect(groupCountButton).toContain(\'variant="secondary"\')');
  });

  it('keeps TC-1004 aligned with the CourseCycleStatus YAGNI guard', () => {
    const section = e2eCaseSection('TC-1004');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1004-course-cycle-status-contract.test.ts',
    );
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'ta',
      'course-cycle-status.test.ts',
    );

    expect(section).toContain('issue #1004');
    expect(section).toContain('availableCourses.length');
    expect(section).toContain('availableCoursesCount');
    expect(section).toContain('tc-1004-course-cycle-status-contract.test.ts');
    expect(guard).toContain("e2eCaseSection('TC-1004')");
    expect(guard).toContain("expect(helperSource).not.toContain('availableCount')");
    expect(guard).toContain('availableCoursesCount={availableCourses.length}');
    expect(unitTest).not.toContain('availableCount');
  });

  it('keeps TC-1005 aligned with the shared TA course-cycle panel guard', () => {
    const section = e2eCaseSection('TC-1005');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1005-course-cycle-panel-contract.test.ts',
    );
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'course-cycle-status-panel.test.tsx',
    );

    expect(section).toContain('issue #1005');
    expect(section).toContain('CourseCycleStatusPanel');
    expect(section).toContain('E2E_TESTS=TC-1005 node e2e/tc-ta.js');
    expect(section).toContain('tc-1005-course-cycle-panel-contract.test.ts');
    expect(guard).toContain("e2eCaseSection('TC-1005')");
    expect(guard).toContain("expect(finalsPageSource).toContain('<CourseCycleStatusPanel')");
    expect(componentTest).toContain('availableCoursesCount={13}');
    expect(tcTa).toContain("{ name: 'TC-1005', fn: runTc1005 }");
    expect(tcTa).toContain("log('TC-1005'");
  });

  it('keeps TC-702 aligned with direct driver-points JsonNull reporting coverage', () => {
    const section = e2eCaseSection('TC-702');

    expect(section).toContain('issue #1099/#1437');
    expect(section).toContain('`Prisma.JsonNull`');
    expect(section).toContain('`null`');
    expect(tcGp).toContain("{ name: 'TC-702', fn: runTc702 }");
    expect(tcGp).toContain('updated?.player1ReportedRaces === null');
  });

  it('keeps TC-TA-FLOW-24 documented as the parent runnable for rank sub-coverage', () => {
    const section = e2eCaseSection('TC-TA-FLOW-24');

    expect(section).toContain('24名 TA');
    expect(section).toContain('TC-TA-FLOW-24-RANK');
    expect(section).toContain('npm run e2e:preview:ta-flow');
    expect(tcTaFlow).toContain("{ name: 'TC-TA-FLOW-24', fn: runFullFlow }");
  });

  it('keeps TC-TA-FLOW-24-RANK aligned with direct helper and TypeScript contract coverage', () => {
    const section = e2eCaseSection('TC-TA-FLOW-24-RANK');
    const unitTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'ta-flow-rank-assertions.test.ts');

    expect(section).toContain('collectEliminationOrder');
    expect(section).toContain('ta-flow-rank-assertions.d.ts');
    expect(unitTest).toContain('collects no eliminations from missing phase3 rounds');
    expect(unitTest).toContain('ignores missing eliminatedIds and invalid player ids');
    expect(taFlowRankAssertionsTypes).toContain('export function collectEliminationOrder');
    expect(taFlowRankAssertionsTypes).toContain('export function evaluateTaFlowRankAssertion');
  });

  it('keeps TA sudden-death non-target protection explicitly asserted', () => {
    const testCase = sectionBetween(
      taFinalsPhaseManagerTest,
      'keeps non-sudden players from becoming an unintended elimination target in phase3',
      '    });\n  });',
    );

    expect(testCase).toContain('expect(result.eliminatedIds).toEqual(["p5"])');
    expect(testCase).toContain('for (const protectedPlayerId of ["p1", "p2", "p3"])');
    expect(testCase).toContain('expect(result.eliminatedIds).not.toContain(protectedPlayerId)');
  });

  it('keeps TC-1060 aligned with complete TA finals position unit coverage', () => {
    const section = e2eCaseSection('TC-1060');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );
    const testCase = sectionBetween(
      unitTest,
      "it('assigns TA finals bonus positions through 24th from phase eliminations'",
      '  });\n\n  // =========================================================================',
    );

    expect(section).toContain('issue #1060');
    expect(section).toContain('18・19・22・23');
    expect(section).toContain('smkc-score-app/__tests__/lib/points/overall-ranking.test.ts');
    expect(testCase).toContain("expect(positions).toEqual([");
    for (const [playerId, position] of [
      ['p17', 17],
      ['p18', 18],
      ['p19', 19],
      ['p20', 20],
      ['p21', 21],
      ['p22', 22],
      ['p23', 23],
      ['p24', 24],
    ] as const) {
      expect(testCase).toContain(`{ playerId: '${playerId}', position: ${position} }`);
    }
    expect(testCase).not.toContain('expect.arrayContaining');
  });

  it('keeps TC-1059 aligned with the TA phase position floor guard', () => {
    const section = e2eCaseSection('TC-1059');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );

    expect(section).toContain('issue #1059');
    expect(section).toContain('17〜20位');
    expect(section).toContain('21〜24位');
    expect(section).toContain('順位帯を越えず');
    expect(section).toContain('e2e-cases-drift.test.ts');
    expect(unitTest).toContain("does not assign excess phase1/2 eliminations outside their position ranges");
    expect(unitTest).toContain('p16-overflow');
    expect(unitTest).toContain('p20-overflow');
  });

  it('keeps qualification points header tooltip coverage documented and scripted', () => {
    const helper = readE2eLib('common.js');

    for (const tc of ['TC-532', 'TC-622', 'TC-723'] as const) {
      const section = e2eCaseSection(tc);

      expect(section).toContain('title に 0-1000 正規化の説明');
      expect(section).toContain('説明 title');
    }

    expect(helper).toContain('getQualificationPointsTooltipTitles');
    expect(helper).toContain("require('../../messages/ja.json').common");
    expect(helper).toContain("require('../../messages/en.json').common");
    expect(helper).toContain('qualification points header missing tooltip title');
  });

  it('keeps TC-521 aligned with BM finals score-dialog long-name truncation', () => {
    const section = e2eCaseSection('TC-521');
    const classTokenSets = Array.from(bmFinalsPage.matchAll(/className="([^"]+)"/g))
      .map((match) => new Set(match[1].split(/\s+/).filter(Boolean)));
    const hasClassSet = (tokens: string[]) =>
      classTokenSets.some((classSet) => tokens.every((token) => classSet.has(token)));

    expect(section).toContain('長いプレイヤー名');
    expect(tcBm).toContain('labelsStayCapped');
    expect(hasClassSet(['flex', 'min-w-0', 'max-w-full', 'flex-wrap', 'items-center'])).toBe(true);
    expect(hasClassSet(['min-w-0', 'max-w-[180px]', 'truncate', 'sm:max-w-[240px]'])).toBe(true);
    expect(hasClassSet(['block', 'max-w-[140px]', 'truncate'])).toBe(true);
    expect(hasClassSet(['min-w-0', 'text-center'])).toBe(true);
  });

  it('keeps TC-519 waiting for the specific BM losers_r1 TBD cards', () => {
    const section = e2eCaseSection('TC-519');

    expect(section).toContain('TBD');
    expect(tcBm).toContain('matchCardTitle(8)');
    expect(tcBm).toContain('matchCardTitle(9)');
    expect(tcBm).toContain('await Promise.all([');
    expect(tcBm).toContain("m8Card.waitFor({ state: 'visible', timeout: 40000 })");
    expect(tcBm).toContain("m9Card.waitFor({ state: 'visible', timeout: 40000 })");
    expect(tcBm).toContain('M8 does not show both players as TBD (text: ${m8Text.slice(0, 120)}; cards=${JSON.stringify(cardTexts)})');
    expect(tcBm).toContain('M9 does not show both players as TBD (text: ${m9Text.slice(0, 120)}; cards=${JSON.stringify(cardTexts)})');
    expect(tcBm).not.toContain('const hasM8 = await m8Card.count() > 0');
    expect(tcBm).not.toContain('const hasM9 = await m9Card.count() > 0');
  });

  it('keeps TC-513 session-guidance waits diagnostic and unsuppressed', () => {
    const section = e2eCaseSection('TC-513');
    const tc513Source = sectionBetween(
      tcBm,
      'async function runTc513',
      '/* ───────── TC-503',
    );

    expect(section).toContain('未認証/管理者/プレイヤー');
    expect(tcBm).toContain('BM_MATCH_GUIDANCE_TIMEOUT_MS');
    expect(tcBm).toContain('async function waitForBmMatchGuidance');
    expect(tcBm).not.toContain('function bmMatchGuidanceRegex');
    expect(tcBm).not.toContain('function compactBodyText');
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*anonPage/);
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*adminPage/);
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*playerPage/);
    expect(tcBm).toContain('guidance did not appear within');
    expect(tcBm).toContain('readyState=');
    expect(tc513Source).toContain('if (anonContext) await anonContext.close().catch(() => {})');
    expect(tc513Source).toContain('if (anonBrowser) await anonBrowser.close().catch(() => {})');
    expect(tc513Source).toContain('if (playerBrowser) await playerBrowser.close().catch(() => {})');
    expect(tc513Source).not.toContain('waitForFunction(');
  });

  it('keeps TC-531 BM finals navigation routed through the BASE-aware nav helper', () => {
    const section = e2eCaseSection('TC-531');
    const tc531Source = sectionBetween(
      tcBm,
      'async function runTc531',
      '/**\n * Builds the BM suite spec',
    );

    expect(section).toContain('issue #889');
    expect(section).toContain('`nav`');
    expect(tc531Source).toContain('await nav(adminPage, `/tournaments/${tournamentId}/bm/finals`)');
    expect(tc531Source).not.toMatch(/\.goto\(\s*`?\/tournaments/);
  });

  it('keeps TC-858 MR Top-24 generation protected by an explicit reset cycle', () => {
    const section = e2eCaseSection('TC-858');
    const tc858Source = sectionBetween(
      tcMr,
      'async function runTc858',
      '/* END TC-858 */',
    );
    const unlockIdx = tc858Source.indexOf('apiUpdateTournament(adminPage, tournamentId, { mrQualificationConfirmed: false })');
    const resetIdx = tc858Source.indexOf('body: JSON.stringify({ reset: true })');
    const reconfirmIdx = tc858Source.indexOf('apiUpdateTournament(adminPage, tournamentId, { mrQualificationConfirmed: true })');
    const generateIdx = tc858Source.indexOf('generateMrFinalsBracket(adminPage, tournamentId, 24)');

    expect(section).toContain('issue #888');
    expect(section).toContain('409');
    expect(section).toContain('reset');
    expect(section).toContain('mrQualificationConfirmed');
    expect(section).toContain('tc-all.js');
    expect(tcAll).toContain("const mrModule = require('./tc-mr')");
    expect(tcAll).toContain("{ label: 'MR Tests', mod: mrModule }");
    expect(tcMr).toContain("{ name: 'TC-858', fn: runTc858 }");
    expect(unlockIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeGreaterThan(unlockIdx);
    expect(reconfirmIdx).toBeGreaterThan(resetIdx);
    expect(generateIdx).toBeGreaterThan(reconfirmIdx);
  });

  it('keeps TC-2243 aligned on the documented all-suite E2E command', () => {
    const section = e2eCaseSection('TC-2243');
    const scopeNote = sectionBetween(
      readRepoFile('E2E_TEST_CASES.md'),
      '## Scope note:',
      '---',
    );
    const claudeGuide = readRepoFile('CLAUDE.md');

    expect(section).toContain('issue #2243');
    expect(section).toContain('node e2e/tc-all.js');
    expect(scopeNote).toContain('node e2e/tc-all.js');
    expect(scopeNote).not.toContain('smkc-score-app/tc-all.js');
    expect(claudeGuide).toContain('node e2e/tc-all.js');
  });

  it('keeps TC-1063 aligned with the combined standings memoization guard', () => {
    const section = e2eCaseSection('TC-1063');
    const tc1555 = e2eCaseSection('TC-1555');
    const tc1556 = e2eCaseSection('TC-1556');
    const tc1558 = e2eCaseSection('TC-1558');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1063-combined-rankings-usememo.test.ts',
    );

    expect(section).toContain('issue #1063');
    expect(section).toContain('issue #1555/#1556');
    expect(section).toContain('BM/MR/GP');
    expect(section).toContain('useMemo');
    expect(section).toContain('computeCombinedRanks');
    expect(section).toContain('tc-1063-combined-rankings-usememo.test.ts');
    expect(tc1555).toContain('issue #1555');
    expect(tc1555).toContain('ranking-utils.test.ts');
    expect(tc1555).toContain('comparator');
    expect(tc1556).toContain('issue #1556');
    expect(tc1556).toContain('import 順');
    expect(tc1556).toContain('tc-1063-combined-rankings-usememo.test.ts');
    expect(tc1558).toContain('issue #1558');
    expect(tc1558).toContain('ScorePointsEntry');
    expect(tc1558).toContain('ranking-utils.test.ts');
    expect(guard).toContain('combinedRankings');
    expect(guard).toContain('compareByScoreThenPoints');
    expect(guard).toContain('toMatch(/import');
  });

  it('keeps TC-1068 aligned with orphan eliminated-entry ordering coverage', () => {
    const section = e2eCaseSection('TC-1068');

    // Keep the doc assertions intentionally narrow: TC prose can change as long as
    // it still links the issue to the executable API route coverage.
    expect(section).toContain('issue #1068');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');
    const routeCase = sectionBetween(
      taPhasesRouteTest,
      "it('keeps orphaned eliminated entries after round-backed eliminations'",
      "it('should query rounds with correct phase filter'",
    );
    expect(routeCase).toContain('player-orphan-eliminated');
    const anchorIdx = routeCase.indexOf('expect(call.data.entries.map');
    expect(anchorIdx).toBeGreaterThanOrEqual(0);
    const orderAssertion = routeCase.slice(anchorIdx);
    const expectedOrder = [
      "'player-active'",
      "'player-eliminated-late'",
      "'player-eliminated-early'",
      "'player-orphan-eliminated'",
    ];
    const orderIndexes = expectedOrder.map((playerId) => orderAssertion.indexOf(playerId));
    expect(orderIndexes.every((index) => index >= 0)).toBe(true);
    expect(orderIndexes).toEqual([...orderIndexes].sort((a, b) => a - b));
  });

  it('keeps TC-1067 aligned with eliminatedIds index tiebreak coverage', () => {
    const section = e2eCaseSection('TC-1067');

    expect(section).toContain('issue #1067');
    expect(section).toContain('同一ラウンド');
    expect(section).toContain('同じ `timeMs`');
    expect(section).toContain('eliminatedIds');
    expect(section).toContain('totalTime');
    expect(section).toContain('rank');
    expect(section).toContain('fallback の qualification fields ではなく `eliminatedIds` index');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');

    const routeCase = sectionBetween(
      taPhasesRouteTest,
      "it('uses eliminatedIds order as the tiebreaker for same-round same-time eliminations'",
      "it('keeps orphaned eliminated entries after round-backed eliminations'",
    );
    expect(routeCase).toContain('player-eliminated-first');
    expect(routeCase).toContain('player-eliminated-second');
    expect(routeCase).toContain('Keep totalTime/rank intentionally opposite to eliminatedIds order');
    expect(routeCase).toContain("eliminatedIds: ['player-eliminated-first', 'player-eliminated-second']");
    expect(routeCase).toContain('timeMs: 88000');
    const anchorIdx = routeCase.indexOf('expect(call.data.entries.map');
    expect(anchorIdx).toBeGreaterThanOrEqual(0);
    const orderAssertion = routeCase.slice(anchorIdx);
    const expectedOrder = [
      "'player-active'",
      "'player-eliminated-first'",
      "'player-eliminated-second'",
    ];
    const orderIndexes = expectedOrder.map((playerId) => orderAssertion.indexOf(playerId));
    expect(orderIndexes.every((index) => index >= 0)).toBe(true);
    expect(orderIndexes).toEqual([...orderIndexes].sort((a, b) => a - b));
  });

  it('keeps TC-2045 aligned with the marker-independent TA phases guard', () => {
    const section = e2eCaseSection('TC-2045');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-2040-ta-phases-comment-history.test.ts',
    );
    const helper = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2045');
    expect(section).toContain('sectionAfterBlockComment');
    expect(section).toContain('End of the D1 read section');
    expect(section).toContain('const normalizedRounds =');
    expect(guard).toContain('sectionAfterBlockComment');
    expect(guard).toContain('const normalizedRounds = rounds.map');
    expect(guard).not.toContain("blockEndMarker = 'End of the D1 read section'");
    expect(helper).toContain('extracts code after a block comment');
    expect(helper).toContain('fails clearly when the post-comment section boundary is missing');
  });

  it('keeps TC-2049 aligned with the sectionAfterBlockComment first-match contract', () => {
    const section = e2eCaseSection('TC-2049');
    const helper = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.ts');
    const helperTest = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2049');
    expect(section).toContain('first block comment contract');
    expect(section).toContain('同じ `commentStartMarker`');
    expect(helper).toContain('first block comment');
    expect(helper).toContain('that contains `commentStartMarker`');
    expect(helperTest).toContain('uses the first matching block comment when markers repeat');
    expect(helperTest).toContain('secondEntries');
  });

  it('keeps TC-2078 aligned with TA suite timeout coverage', () => {
    const section = e2eCaseSection('TC-2078');
    const tcTaTimeoutTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'ta-suite-timeout.test.ts');
    const runnerTimeoutTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'e2e-runner-timeout.test.ts');

    expect(section).toContain('issue #2078');
    expect(section).toContain('75分上限');
    expect(section).toContain('29ケース');
    expect(section).toContain('TC-1005');
    expect(section).toContain('E2E_SUITE_TIMEOUT_MS');
    expect(section).toContain('issue #2111');
    expect(section).toContain('nullish fallback');
    expect(section).toContain('__tests__/e2e/ta-suite-timeout.test.ts');
    expect(section).toContain('__tests__/lib/e2e-runner-timeout.test.ts');
    expect(tcTaTimeoutTest).toContain('TA_SUITE_TIMEOUT_MS');
    expect(tcTaTimeoutTest).toContain('75 * 60 * 1000');
    expect(tcTaTimeoutTest).toContain('TC-1005');
    expect(runnerTimeoutTest).toContain('resolveSuiteTimeoutMs');
    expect(runnerTimeoutTest).toContain('E2E_SUITE_TIMEOUT_MS');
    expect(runnerTimeoutTest).toContain('preserves explicit zero');
  });

  it('keeps TC-2055 aligned with the sectionBetween allowTerminal contract', () => {
    const section = e2eCaseSection('TC-2055');
    const helper = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.ts');
    const helperTest = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2055');
    expect(section).toContain('allowTerminal: true');
    expect(section).toContain('terminal section for marker');
    expect(section).toContain('end marker 欠落時の正常系と空本文エラー系');
    expect(helper).toContain('allowTerminal = false');
    expect(helper).toContain('terminal section for marker');
    expect(helperTest).toContain('allows terminal sections when an end marker is intentionally absent');
    expect(helperTest).toContain('fails when an allowed terminal section has no content');
  });

  it('keeps TC-2058 aligned with the sectionBetween whitespace-only terminal contract', () => {
    const section = e2eCaseSection('TC-2058');
    const helper = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.ts');
    const helperTest = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2058');
    expect(section).toContain('空白のみ');
    expect(section).toContain('terminal section for marker');
    expect(helper).toContain('terminalContent.trim()');
    expect(helperTest).toContain('fails when an allowed terminal section has only whitespace content');
    expect(helperTest).toContain('TC-2058-WHITESPACE-TERMINAL-SECTION-START');
  });

  it('keeps TC-2063 aligned with the sectionBetween mixed-whitespace terminal contract', () => {
    const section = e2eCaseSection('TC-2063');
    const helper = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.ts');
    const helperTest = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2063');
    expect(section).toContain('スペースとタブ');
    expect(section).toContain('terminal section for marker');
    expect(helper).toContain('terminalContent.trim()');
    expect(helperTest).toContain('fails when an allowed terminal section has only mixed space and tab content');
    expect(helperTest).toContain('TC-2063-MIXED-WHITESPACE-TERMINAL-SECTION-START');
  });

  it('keeps TC-717 aligned with the assignedCups scenario', () => {
    const section = e2eCaseSection('TC-717');

    expect(section).toContain('assignedCups');
    expect(section).toContain('FT2 相当');
    expect(section).toContain('FT3 相当');
    expect(section).toContain('first-seen');
    expect(section).toContain('round-scoped `updateMany()`');
    expect(section).toContain('O(rounds)');
    expect(section).toContain('id IN (...)');
    expect(section).toContain('一部失敗しても閲覧レスポンスを継続');
    expect(section).toContain('失敗件数と理由を警告ログ');
    expect(section).toContain('gp/finals/route.test.ts');
    expect(tcGp).toContain("require('./lib/gp-finals-validators')");
    expect(tcGp).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('isGpFinalsFt3Round');
    expect(gpFinalsValidatorExports).toEqual(expect.objectContaining({
      isGpFinalsFt3Round: expect.any(Function),
      validateGpFinalsAssignedCupSequences: expect.any(Function),
    }));
  });

  // TC-2196-DRIFT-GUARD-START
  it('keeps TC-2196 aligned with overlay phase target-wins stage context', () => {
    const section = e2eCaseSection('TC-2196');
    const readCurrentPhaseInputSource = sectionBetween(
      overlayEventsRoute,
      'async function readCurrentPhaseInput',
      'function parseSince',
    );
    const overlayFinalsStageFilters = [
      'prisma.bMMatch.findFirst',
      'prisma.mRMatch.findFirst',
      'prisma.gPMatch.findFirst',
    ].flatMap((callee) => callObjectArrayLiteralTexts(readCurrentPhaseInputSource, callee, [
      'where',
      'stage',
      'in',
    ]));
    const overlayFinalsSelects = [
      'prisma.bMMatch.findFirst',
      'prisma.mRMatch.findFirst',
      'prisma.gPMatch.findFirst',
    ].flatMap((callee) => callObjectPropertyNames(readCurrentPhaseInputSource, callee, [
      'select',
    ]));

    expect(section).toContain('issue #2196');
    expect(section).toContain('latestFinalsStage: "playoff"');
    expect(section).toContain('getBmFinalsTargetWins');
    expect(section).toContain('getMrFinalsTargetWins');
    expect(section).toContain('overlay-events route');
    expect(section).toContain('tc-2196-overlay-phase-format.test.ts');
    expect(overlayPhase).toContain('latestFinalsStage: string | null');
    expect(overlayPhase).toContain('stage: latestFinalsStage');
    expect(overlayFinalsStageFilters.length).toBeGreaterThanOrEqual(3);
    for (const stageFilter of overlayFinalsStageFilters) {
      expect(stageFilter).toEqual(['playoff', 'finals']);
    }
    expect(overlayFinalsSelects.length).toBeGreaterThanOrEqual(3);
    for (const selectProperties of overlayFinalsSelects) {
      expect(selectProperties).toEqual(expect.arrayContaining(['stage', 'round', 'createdAt']));
    }
    expect(overlayEventsRoute).toContain('latestFinalsStage: latestFinals?.stage ?? null');
    expect(tc2196OverlayPhaseFormatTest).toContain("latestFinalsStage: 'playoff'");
    expect(tc2196OverlayPhaseFormatTest).toContain("latestFinalsRound: 'playoff_r1'");
    expect(tc2196OverlayPhaseFormatTest).toContain("latestFinalsRound: 'playoff_r2'");
  });
  // TC-2196-DRIFT-GUARD-END

  it('keeps TC-2200 aligned with required nullable overlay finals stage input', () => {
    const section = e2eCaseSection('TC-2200');
    const tc2200OverlayPhaseInputTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'e2e',
      'tc-2200-overlay-phase-input.test.ts',
    );

    expect(section).toContain('issue #2200');
    expect(section).toContain('latestFinalsStage: string | null');
    expect(section).toContain('required nullable');
    expect(section).toContain('tc-2200-overlay-phase-input.test.ts');
    expect(overlayPhase).toContain('latestFinalsStage: string | null');
    expect(overlayPhase).not.toContain('latestFinalsStage?: string | null');
    expect(overlayPhaseTest).toContain('latestFinalsStage: null');
    expect(tc2200OverlayPhaseInputTest).toContain('type LatestFinalsStageIsRequired');
    expect(tc2200OverlayPhaseInputTest).toContain('latestFinalsStage: null');
  });

  it('keeps TC-2201 aligned with AST-backed overlay-events stage guard coverage', () => {
    const section = e2eCaseSection('TC-2201');
    const tc2196DriftGuard = sectionBetween(
      readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts'),
      '// TC-2196-DRIFT-GUARD-START',
      '// TC-2196-DRIFT-GUARD-END',
    );

    expect(section).toContain('issue #2201');
    expect(section).toContain('AST');
    expect(section).toContain('where.stage.in');
    expect(section).toContain('stage');
    expect(section).toContain('round');
    expect(section).toContain('createdAt');
    expect(tc2196DriftGuard).toContain('callObjectArrayLiteralTexts');
    expect(tc2196DriftGuard).toContain('callObjectPropertyNames');
    expect(tc2196DriftGuard).not.toContain('stage: { in: ["playoff", "finals"] }');
    expect(tc2196DriftGuard).not.toContain('select: { stage: true, round: true, createdAt: true }');
  });

  // TC-2224-DRIFT-GUARD-START
  it('keeps TC-2224 aligned with overlay finals select count guard coverage', () => {
    const section = e2eCaseSection('TC-2224');
    const tc2196DriftGuard = sectionBetween(
      readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts'),
      '// TC-2196-DRIFT-GUARD-START',
      '// TC-2196-DRIFT-GUARD-END',
    );

    expect(section).toContain('issue #2224');
    expect(section).toContain('overlayFinalsSelects.length');
    expect(section).toContain('toBeGreaterThanOrEqual(3)');
    expect(section).toContain('3 件以上');
    expect(section).toContain('stage');
    expect(section).toContain('round');
    expect(section).toContain('createdAt');
    expect(tc2196DriftGuard).toContain('overlayFinalsSelects.length');
    // Verify the threshold (3) is also checked, not just the assertion name — see issue #2369
    expect(tc2196DriftGuard).toContain('toBeGreaterThanOrEqual(3)');
  });
  // TC-2224-DRIFT-GUARD-END

  it('keeps TC-2229 aligned with stable TC-2224 drift guard extraction', () => {
    const section = e2eCaseSection('TC-2229');
    const docsDriftSource = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
    const tc2224DriftGuard = sectionBetween(
      docsDriftSource,
      '// TC-2224-DRIFT-GUARD-START',
      '// TC-2224-DRIFT-GUARD-END',
    );

    expect(section).toContain('issue #2229');
    expect(section).toContain('TC-2196-DRIFT-GUARD-START');
    expect(section).toContain('TC-2224-DRIFT-GUARD-START');
    expect(section).toContain('overlayFinalsSelects.length');
    expect(section).toContain('toBeGreaterThanOrEqual');
    expect(tc2224DriftGuard).toContain('// TC-2196-DRIFT-GUARD-START');
    expect(tc2224DriftGuard).toContain('// TC-2196-DRIFT-GUARD-END');
    expect(tc2224DriftGuard).toContain('overlayFinalsSelects.length');
    expect(tc2224DriftGuard).not.toContain(
      'expect(overlayFinalsSelects.length).toBeGreaterThanOrEqual(3)',
    );
  });

  it('keeps TC-2225 aligned with missing-callee helper coverage', () => {
    const section = e2eCaseSection('TC-2225');
    const helperTests = readRepoFile('smkc-score-app', '__tests__', 'helpers', 'e2e-cases.test.ts');

    expect(section).toContain('issue #2225');
    expect(section).toContain('callee が見つからない');
    expect(section).toContain('空配列');
    expect(section).toContain('callObjectArrayLiteralTexts');
    expect(section).toContain('callObjectPropertyNames');
    expect(helperTests).toContain("it('returns empty arrays when the requested callee is absent'");
    expect(helperTests).toContain('prisma.NONEXISTENT.findFirst');
  });

  it('keeps TC-2266 aligned with server-ranking rankOverride narrowing coverage', () => {
    const section = e2eCaseSection('TC-2266');
    const serverRankingTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'server-ranking.test.ts');

    expect(section).toContain('issue #2266');
    expect(section).toContain('entry.rankOverride != null');
    expect(section).toContain('rankOverride: undefined');
    expect(serverRanking).toContain('if (entry.rankOverride != null)');
    // Use regex so a rename of the boolean variable (e.g. overrideRank → hasOverride) still triggers detection — see issue #2353
    expect(serverRanking).not.toMatch(/const \w+ = entry\.rankOverride != null/);
    expect(serverRankingTest).toContain('treats undefined rankOverride as auto-ranked');
    expect(serverRankingTest).toContain('rankOverride: undefined');
    expect(serverRankingTest).toContain('expect(autoRanked?._rankOverridden).toBeUndefined()');
  });

  it('keeps TC-1087 aligned with finite positive round-number guards', () => {
    const section = e2eCaseSection('TC-1087');

    expect(section).toContain('有限な正の1始まり整数');
    expect(section).toContain('NaN');
    expect(section).toContain('Infinity');
    expect(tcGp).toContain('Keep the finite check explicit to cover NaN/Infinity edge cases tested in TC-1087.');
    expect(tcGp).toContain('Number.isFinite(match.roundNumber)');
    expect(tcGp).toContain('Number.isInteger(match.roundNumber)');
  });

  it('keeps TC-1079 aligned with MR finite positive round-number guards', () => {
    const section = e2eCaseSection('TC-1079');

    expect(section).toContain('MR 予選コース選択');
    expect(section).toContain('NaN');
    expect(section).toContain('Infinity');
    expect(section).toContain('tc-mr.js TC-601 内で検証');
    expect(tcMr).toContain('Number.isInteger(match.roundNumber)');
    expect(tcMr).toContain('match.roundNumber < 1');
    expect(tcMr).not.toContain('Number.isFinite(match.roundNumber)');
  });

  it('keeps TC-1083 aligned with MR participant correction coverage', () => {
    const section = e2eCaseSection('TC-1083');
    const tc1083 = sectionBetween(tcMr, 'async function runTc1083', '/**\n * TC-603');

    expect(section).toContain('issue #1083');
    expect(section).toContain('issue #1463/#1464/#1466');
    expect(section).toContain('ドキュメント確認は drift test に一本化');
    expect(section).toContain('Correct Score');
    expect(section).toContain('Submit Correction');
    expect(section).toContain('player1ReportedPoints');
    expect(section).toContain('MrScoreEditor');
    expect(section).toContain('/api/tournaments/[temp-id]/mr/standings');
    expect(section).toContain('ties=1');
    expect(section).toContain('score=1');
    expect(tc1083).toContain("log('TC-1083'");
    expect(tc1083).toContain('Previous Reports');
    expect(tc1083).toContain('apiFetchMr');
    expect(tc1083).toContain('apiFetchMrStandings');
    expect(tc1083).toContain('assertMrStandingStats');
    // assertMrStandingStats must be wrapped in try-catch to avoid bypassing log() (issue #2370)
    expect(tc1083).toContain('standingsErr');
    expect(mrReportRouteTest).toContain('useRoundDifferential: true');
    // Use test case name instead of internal error message to avoid implementation-string dependency (#2372).
    expect(mrStandingsAssertionsTest).toContain("'fails with a targeted stat diff'");
    expect(tc1083).not.toContain('waitForTimeout(3000)');
  });

  it('keeps TC-608 assertMrStandingStats wrapped in try-catch to avoid bypassing log()', () => {
    const tc608 = sectionBetween(tcMr, 'async function runTc608', 'async function runTc609');
    // assertMrStandingStats must be wrapped in try-catch to avoid bypassing log() (issue #2370/#2425)
    expect(tc608).toContain('standingsErr');
  });

  it('keeps TC-1082 aligned with shared BM/MR participant score input coverage', () => {
    const section = e2eCaseSection('TC-1082');
    const bmPage = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'tournaments',
      '[id]',
      'bm',
      'participant',
      'page.tsx',
    );
    const mrPage = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'tournaments',
      '[id]',
      'mr',
      'participant',
      'page.tsx',
    );

    expect(section).toContain('issue #1082');
    expect(section).toContain('issue #1469/#1470');
    expect(section).toContain('issue #1472/#1473');
    expect(section).toContain('issue #1475/#1476/#1478');
    expect(section).toContain('issue #1480');
    expect(section).toContain('issue #1482');
    expect(section).toContain('issue #1484');
    expect(section).toContain('TypeScript AST');
    expect(section).toContain('useParticipantScoreInput');
    expect(section).toContain('requiredTotalScore');
    expect(section).toContain('maxScorePerSide');
    expect(section).toContain('TC-322');
    expect(section).toContain('TC-1083');
    expect(bmPage).toContain('useParticipantScoreInput<BMMatch>');
    expect(mrPage).toContain('useParticipantScoreInput<MRMatch>');
  });

  it('keeps TC-1072 aligned with direct LR2 loserGoesTo coverage', () => {
    const section = e2eCaseSection('TC-1072');

    expect(section).toContain('issue #1072');
    expect(section).toContain('`loserGoesTo`');
    expect(section).toContain('[23, 22, 21, 20]');
    expect(section).toContain('tc-1073-16p-lr2-slots.test.ts');
    expect(tc1073Lr2Slots).toContain('TC-1072 keeps LR2 pairing coverage on direct loserGoesTo values');
    expect(tc1073Lr2Slots).toContain('.map((match) => match.loserGoesTo)');
    expect(tc1073Lr2Slots).toContain(').toEqual([23, 22, 21, 20])');
  });

  it('keeps TC-1534-1535 aligned with direct LR2 source route coverage', () => {
    const section = e2eCaseSection('TC-1534-1535');

    expect(section).toContain('issues #1534, #1535, #1537');
    expect(section).toContain('`winnerGoesTo`');
    expect(section).toContain('`position`');
    expect(section).toContain('tc-1073-16p-lr2-slots.test.ts');
    expect(tc1073Lr2Slots).toContain('TC-1535 keeps LR2 source routes explicit on both bracket sides');
    expect(tc1073Lr2Slots).toContain(".filter((match) => match.round === 'losers_r1')");
    expect(tc1073Lr2Slots).toContain('winnerGoesTo: match.winnerGoesTo');
    expect(tc1073Lr2Slots).not.toContain('new Map(');
    expect(tc1073Lr2Slots).not.toContain('.find(');
  });

  it('keeps TC-722 from duplicating GP finals target-wins logic in E2E', () => {
    const section = e2eCaseSection('TC-722');

    expect(section).toContain('completed=true');
    expect(section).toContain('FT数を再計算せず');
    expect(section).toContain('PUTレスポンスの更新済みmatch');
    expect(section).toContain('FT3の最大3勝に対応する3カップ');
    expect(tcGp).toContain('completeGpFinalsMatchByCompletedFlag');
    expect(tcGp).toContain('gpFinalsUpdatedMatchFromPutResult');
    expect(tcGp).toContain('updated?.completed === true');
    expect(tcGp).not.toContain('gpFinalsTargetWinsForRound');
  });

  it('keeps TC-1109 aligned with direct GP max-cups usage', () => {
    const section = e2eCaseSection('TC-1109');

    expect(section).toContain('getGpFinalsMaxCups');
    expect(section).toContain('getLockedCupCountForMatch');
    expect(section).toContain('match-shaped identifier');
    expect(section).toContain('FT2は3カップ');
    expect(section).toContain('FT3は5カップ');
    expect(tcGp).toContain("log('TC-1109'");
    expect(tcGp).toContain('getGpFinalsMaxCups');
    expect(tcGp).toContain('getLockedCupCountForMatch');
    expect(tcGp).toContain('/getGpFinalsMaxCups\\([A-Za-z_][A-Za-z0-9_]*\\)/g');
    expect(tcGp).toContain('directMatchCalls.length >= 2');
  });

  it('keeps TC-2247 aligned with minimal GP tied sudden-death updatedMatch fixtures', () => {
    const section = e2eCaseSection('TC-2247');
    const redundantUpdatedMatch =
      /\{\s*\.\.\.mockMatch,\s*points1:\s*2,\s*points2:\s*2,\s*completed:\s*false,\s*suddenDeathWinnerId:\s*null\s*\}/;

    expect(section).toContain('issue #2247');
    expect(section).toContain('suddenDeathWinnerId: null');
    expect(section).toContain('prisma.gPMatch.update');
    expect(section).toContain('gp/finals/route.test.ts');
    // Use regex to tolerate Prettier line-wrap reformatting — see issue #2375
    expect(gpFinalsRouteTest).toMatch(/const updatedMatch\s*=\s*\{\s*\.\.\.mockMatch,\s*suddenDeathWinnerId:\s*null\s*\}/);
    expect(gpFinalsRouteTest).not.toMatch(redundantUpdatedMatch);
    expect(gpFinalsRouteTest).toContain('points1: 2');
    expect(gpFinalsRouteTest).toContain('points2: 2');
    expect(gpFinalsRouteTest).toContain('completed: false');
  });

  it('keeps TC-1098 aligned with shared GP driver-points max usage', () => {
    const section = e2eCaseSection('TC-1098');

    expect(section).toContain('MAX_GP_DRIVER_POINTS');
    expect(section).toContain('src/lib/constants.ts');
    expect(section).toContain('gp/participant/page.tsx');
    expect(section).toContain('gp/match/[matchId]/report/route.ts');
    expect(section).toContain('page-local / route-local');
    expect(tcGp).toContain("log('TC-1098'");
    expect(tcGp).toContain('importsMaxGpDriverPointsFromConstants');
    expect(tcGp).toContain(".split(';')");
    expect(tcGp).toContain('^\\s*import\\s');
    expect(tcGp).toContain("statement.includes('MAX_GP_DRIVER_POINTS')");
    expect(tcGp).toContain('participant page does not import MAX_GP_DRIVER_POINTS from constants');
    expect(tcGp).toContain('report route does not import MAX_GP_DRIVER_POINTS from constants');
    expect(tcGp).toContain('page-local or route-local MAX_GP_DRIVER_POINTS definition remains');
  });

  it('keeps TC-1106 aligned with GP manual driver-points input bounds', () => {
    const section = e2eCaseSection('TC-1106');

    expect(section).toContain('parseGpDriverPointsInput');
    expect(section).toContain('MAX_GP_DRIVER_POINTS');
    expect(section).toContain('gp/page-client.tsx');
    expect(section).toContain('gp/finals/page.tsx');
    expect(section).toContain('type="text"');
    expect(section).toContain('inputMode="numeric"');
    expect(section).toContain('pattern="[0-9]*"');
    expect(tcGp).toContain("log('TC-1106'");
    expect(tcGp).toContain('parseGpDriverPointsInput(manualPoints1)');
    expect(tcGp).toContain('parseGpDriverPointsInput(cup.manualPoints1)');
    expect(tcGp).toContain('value <= MAX_GP_DRIVER_POINTS');
  });

  it.each(['TC-DBG-01', 'TC-DBG-02', 'TC-DBG-03', 'TC-DBG-04'])(
    'keeps %s documented as runnable focused debug-fill coverage',
    (tc) => {
      const section = e2eCaseSection(tc);

      expect(section).toContain(`tc-debug-fill.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:debug-fill');
      expect(tcDebugFill).toContain(`log('${tc}'`);
    },
  );

  it('keeps debug-fill wired into the all-suite dispatcher', () => {
    expect(tcAll).toContain("require('./tc-debug-fill')");
    expect(tcAll).toContain('runDebugFillTests');
    expect(tcAll).toContain('for (const { label, mod, run } of suites)');
  });

  it('keeps PR template Jest coverage out of the E2E case catalog', () => {
    const e2eCases = readRepoFile('E2E_TEST_CASES.md');

    expect(e2eCases).not.toContain('TC-943');
    expect(e2eCases).not.toContain('__tests__/docs/pr-template.test.ts');
  });

  it.each(tc109ClassifiedRows)(
    'keeps %s explicitly classified outside standalone browser runner registration',
    (tc, marker, coverage) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain(marker);
    expect(section).toContain(coverage);
  });

  // [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]
  it('keeps TC-109 helper coverage classified without environment variable names in the URL slot', () => {
    const tc109Rows = tc109ClassifiedRows.filter(([tc]) => tc === 'TC-109');
    const section = e2eCaseSection('TC-109');

    expect(tc109Rows).toHaveLength(2);
    expect(tc109Rows).toEqual([
      ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
      ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/lib/e2e-browser-launch.test.ts'],
    ]);
    expect(tc109Rows.map((entry) => entry.join(',')).join('\n')).not.toContain('PLAYWRIGHT_BROWSERS_PATH');
    expect(section).toContain('fs.mkdirSync');
    expect(section).toContain('実際の `/tmp` 配下へテスト副作用を残さない');
    expect(section).toContain('macOS single-process guard');
    expect(section).toContain('npm run e2e:preview:launch-smoke');
  });
  // [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]

  it('keeps TC-109 drift guard focused on docs instead of helper implementation strings', () => {
    const section = e2eCaseSection('TC-2034');
    const driftTestSource = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
    const tc109DriftBlock = sectionBetween(
      driftTestSource,
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]',
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]',
    );

    expect(section).toContain('TC-109');
    expect(section).toContain('具体的な変数名・アサーション文字列を直接検査していない');
    expect(tc109DriftBlock).toContain("e2eCaseSection('TC-109')");
    expect(tc109DriftBlock).not.toContain("readRepoFile('smkc-score-app', '__tests__', 'e2e', 'run-preview.test.ts')");
    expect(tc109DriftBlock).not.toContain('toHaveBeenCalledWith');
  });

  it('keeps TC-2041 aligned with explicit TC-109 drift guard anchors', () => {
    const section = e2eCaseSection('TC-2041');
    const driftTestSource = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
    const anchoredBlock = sectionBetween(
      driftTestSource,
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-START]',
      '// [TC109-HELPER-COVERAGE-DRIFT-GUARD-END]',
    );

    expect(section).toContain('issue #2041/#2039');
    expect(section).toContain('TC109-HELPER-COVERAGE-DRIFT-GUARD-START/END');
    expect(section).toContain('__tests__/helpers/e2e-cases.test.ts');
    expect(anchoredBlock).toContain("e2eCaseSection('TC-109')");
    expect(anchoredBlock).toContain('fs.mkdirSync');
    expect(anchoredBlock).not.toContain("it('keeps TC-109 drift guard focused on docs instead of helper implementation strings'");
  });

  it('keeps late static-only TC classifications ordered within their local block', () => {
    const source = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
    const block = sectionBetween(
      source,
      "['TC-1451-1452', 'n/a (static/doc coverage)'",
      "['TC-803', 'TC-318 でカバー済み'",
    );

    const orderedTcs = [
      'TC-1451-1452',
      'TC-1454-1455',
      'TC-1457',
      'TC-2006-2007',
      'TC-2031',
      'TC-2034',
      'TC-1528',
      'TC-1669',
      'TC-1671',
    ];
    const indexes = orderedTcs.map((tc) => block.indexOf(`['${tc}'`));

    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('keeps TC-2031 aligned with the shared TA time input prop alias', () => {
    const section = e2eCaseSection('TC-2031');
    const timeEntryLayout = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'time-entry-layout.ts');
    const staticTest = readRepoFile('smkc-score-app', '__tests__', 'static', 'ta-time-input-props-usememo.test.ts');

    expect(section).toContain('issue #2031');
    expect(section).toContain('TaTimeInputProps');
    expect(section).toContain('__tests__/static/ta-time-input-props-usememo.test.ts');
    expect(timeEntryLayout).toContain('export type TaTimeInputProps');
    expect(staticTest).toContain('timeInputProps: TaTimeInputProps');
  });

  it('keeps TC-2006-2007 aligned with shallow BM/MR lean select payload coverage', () => {
    const section = e2eCaseSection('TC-2006-2007');
    const prismaSelectsTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'prisma-selects.test.ts');

    expect(section).toContain('issue #2006/#2007');
    expect(section).toContain('BM_MR_MATCH_LEAN_SELECT');
    expect(section).toContain('shallow');
    expect(section).toContain('smkc-score-app/__tests__/lib/prisma-selects.test.ts');
    expect(prismaSelectsTest).toContain('Object.entries(BM_MR_MATCH_LEAN_SELECT)');
    expect(prismaSelectsTest).toContain('selectedFields.length');
    // Issue #2024: exact-key guard must also be present (detects accidental field additions).
    expect(prismaSelectsTest).toContain('Object.keys(BM_MR_MATCH_LEAN_SELECT)');
    expect(prismaSelectsTest).toContain('EXPECTED_FIELDS');
  });

  it('keeps TC-1090-1091 aligned with overall-ranking static and unit coverage', () => {
    const section = e2eCaseSection('TC-1090-1091');

    expect(section).toContain('issue #1090/#1091');
    expect(section).toContain('Record<MatchQualificationModel');
    expect(section).toContain('BREAK-like');
    expect(section).toContain('__tests__/lib/points/overall-ranking.test.ts');
  });

  it('keeps TC-1451-1452 aligned with the shared E2E case helper coverage', () => {
    const section = e2eCaseSection('TC-1451-1452');

    expect(section).toContain('issue #1451/#1452');
    expect(section).toContain('__tests__/helpers/e2e-cases.ts');
    expect(section).toContain('個別 finder の実装文字列には依存しない');
  });

  it('keeps TC-1454-1455 aligned with helper cache and error coverage', () => {
    const section = e2eCaseSection('TC-1454-1455');

    expect(section).toContain('issue #1454/#1455');
    expect(section).toContain('module-level cache');
    expect(section).toContain('helper 内で `expect()` を呼ばず');
  });

  it('keeps TC-1457 aligned with the readRepoFile/cache declaration order', () => {
    const section = e2eCaseSection('TC-1457');

    expect(section).toContain('issue #1457');
    expect(section).toContain('readRepoFile` 定義が `const e2eCases');
    expect(section).toContain('__tests__/helpers/e2e-cases.ts');
  });

  it('keeps TC-1528 aligned with TA phase helper unit coverage', () => {
    const section = e2eCaseSection('TC-1528');

    expect(section).toContain('issue #1528/#1530/#1531');
    expect(section).toContain('自動コース選択経路');
    expect(section).toContain('コース明示経路');
    expect(section).toContain('同じ内部 start/submit 実装');
    expect(section).toContain('内部 `submitTaPhaseRound` は公開しない');
    expect(section).toContain('__tests__/e2e/ta-phase-submit-helper.test.ts');
    expect(tcTa).toContain('submitTaPhaseRoundByApi');
    expect(tcTa).toContain('submitTaPhaseRoundWithCourseByApi');
    expect(tcTa).toContain('submitTaPhaseRound(adminPage, tournamentId, phase, course, results)');
    expect(tcTa).not.toContain('function phaseCourseLabel');
    expect(tcTa).not.toContain('submitTaPhaseRound,');
  });

  it('keeps TC-111 aligned with the preview D1 columns that fail GP finals before browser launch', () => {
    const section = e2eCaseSection('TC-111');
    const preflightTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'preview-schema-preflight.test.ts');

    expect(section).toContain('Tournament.publicModes');
    expect(section).toContain('GPMatch.assignedCups');
    expect(section).toContain('GPMatch.suddenDeathWinnerId');
    expect(section).toContain('WRANGLER_LOG_PATH');
    expect(section).toContain('wrangler login');
    expect(section).toContain('汎用的な schema/migration 文言だけでは');
    expect(section).toContain('Network error when connecting to schema registry');
    expect(section).toContain('Unexpected schema');
    expect(preflightTest).toContain('classifies only concrete Wrangler schema drift stderr as migration guidance');
    expect(preflightTest).toContain('keeps generic schema or migration stderr out of migration guidance');
  });

  it('keeps TC-2235 aligned with GP finals sudden-death fixture ID consistency', () => {
    const section = e2eCaseSection('TC-2235');
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'app',
      'api',
      'tournaments',
      '[id]',
      'gp',
      'finals',
      'route.test.ts',
    );
    const player1WinnerCase = sectionBetween(
      routeTest,
      'should ignore sudden-death winner on tied GP finals scores while the match is incomplete, even when player1 is named',
      "it('should ignore sudden-death winner on tied GP finals scores while the match is incomplete, even when player2 is named'",
    );
    const player2WinnerCase = sectionBetween(
      routeTest,
      'should ignore sudden-death winner on tied GP finals scores while the match is incomplete, even when player2 is named',
      "it('should allow GP playoff round 1 results to finish at first to 1'",
    );

    const unmatchedCase = sectionBetween(
      routeTest,
      'should ignore sudden-death winner on tied GP finals scores while the match is incomplete, even when unmatched',
      "it('should ignore sudden-death winner on tied GP finals scores while the match is incomplete, even when player1 is named'",
    );

    expect(section).toContain('issue #2235');
    expect(section).toContain("`p1` / `p2`");
    expect(section).toContain('Top-24');
    expect(player1WinnerCase).toContain("player1Id: 'p1'");
    expect(player1WinnerCase).toContain("suddenDeathWinnerId: 'p1'");
    expect(player1WinnerCase).not.toContain('player-19');
    expect(player2WinnerCase).toContain("player2Id: 'p2'");
    expect(player2WinnerCase).toContain("suddenDeathWinnerId: 'p2'");
    expect(player2WinnerCase).not.toContain('player-8');
    /* Unmatched case must use short 'p...' style, not numeric 'player-N' IDs. */
    expect(unmatchedCase).not.toContain('player-z');
    expect(unmatchedCase).toContain("suddenDeathWinnerId: 'p3'");
  });

  it('documents TC-825 as a full Prisma migration JSON type guard for D1', () => {
    const section = e2eCaseSection('TC-825');

    expect(section).toContain('issue #825/#1838');
    expect(section).toContain('全 Prisma migration');
    expect(section).toContain('`prisma/migrations/**/migration.sql`');
    expect(section).toContain('__tests__/docs/prisma-migrations.test.ts');
    expect(prismaMigrationsTest).toContain('migrationSqlFiles');
    expect(prismaMigrationsTest).toContain('expect(jsonbMigrations).toEqual([])');
  });

  it('documents TC-2190-2191 as publicModes overall migration SQL behavior coverage', () => {
    const section = e2eCaseSection('TC-2190-2191');

    expect(section).toContain('issue #2190/#2191');
    expect(section).toContain('NULL publicModes');
    expect(section).toContain('COALESCE(publicModes,');
    expect(section).toContain('idempotency');
    expect(section).toContain('__tests__/docs/prisma-migrations.test.ts');
    expect(prismaMigrationsTest).toContain('adds overall to existing tournament publicModes with SQLite JSON semantics');
    expect(prismaMigrationsTest).toContain("COALESCE(publicModes, '[]')");
    expect(prismaMigrationsTest).toContain("COALESCE(\\\"publicModes\\\", '[]')");
    expect(prismaMigrationsTest).toContain("db.exec(d1Migration)");
  });

  it('documents TC-2107 as MR scoresConfirmed migration type alignment coverage', () => {
    const section = e2eCaseSection('TC-2107');

    expect(section).toContain('issue #2107');
    expect(section).toContain('`BOOLEAN NOT NULL DEFAULT false`');
    expect(section).toContain('`migrations/0036_add_mr_scores_confirmed.sql`');
    expect(section).toContain('`prisma/migrations/0017_mr_scores_confirmed/migration.sql`');
    expect(section).toContain('__tests__/docs/prisma-migrations.test.ts');
    expect(prismaMigrationsTest).toContain('keeps MR scoresConfirmed type declarations aligned');
    expect(prismaMigrationsTest).toContain('readWranglerMigration("0036_add_mr_scores_confirmed.sql")');
    expect(prismaMigrationsTest).toContain('const expectedColumn = \'"scoresConfirmed" BOOLEAN NOT NULL DEFAULT false\'');
  });

  it('documents TC-2206 as MR scoresConfirmed migration drift guard deduplication', () => {
    const section = e2eCaseSection('TC-2206');
    const previewSchemaPreflightTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'e2e',
      'preview-schema-preflight.test.ts',
    );

    expect(section).toContain('issue #2206');
    expect(section).toContain('`__tests__/docs/prisma-migrations.test.ts` が migration SQL の実体チェックを所有');
    expect(section).toContain('TC-2107/TC-2206 の文書化と coverage owner');
    expect(section).toContain('__tests__/e2e/preview-schema-preflight.test.ts');
    expect(prismaMigrationsTest).toContain('readWranglerMigration("0036_add_mr_scores_confirmed.sql")');
    expect(previewSchemaPreflightTest).toContain('keeps TC-2206 documented as migration drift deduplication coverage');
    expect(previewSchemaPreflightTest).not.toContain('0036_add_mr_scores_confirmed.sql');
  });

  it('documents TC-824 as Phase3 sudden-death explicit order coverage', () => {
    const section = e2eCaseSection('TC-824');

    expect(section).toContain('issue #824');
    expect(section).toContain('rank offset');
    expect(section).toContain('明示順序 map');
    expect(section).toContain('__tests__/lib/ta/finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain('uses resolved sudden-death order');
    expect(taFinalsPhaseManagerTest).toContain('resolvedOrder');
  });

  it('documents TC-2249 as Phase2 sudden-death absent-player naming coverage', () => {
    const section = e2eCaseSection('TC-2249');

    expect(section).toContain('issue #2249');
    expect(section).toContain('p3');
    expect(section).toContain('サドンデス不参加');
    expect(section).toContain('__tests__/lib/ta/finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain(
      'returns no targets when one tied player is absent from phase2 sudden death results',
    );
    expect(taFinalsPhaseManagerTest).toContain(
      'p3 tied at the phase2 boundary but did not submit a sudden-death time',
    );
    expect(taFinalsPhaseManagerTest).not.toContain(
      'returns no targets when phase2 sudden death has a unique slowest result',
    );
  });

  it('documents TC-823 as intentional immediate-repeat avoidance for TA course selection', () => {
    const section = e2eCaseSection('TC-823A');

    expect(section).toContain('issue #823');
    expect(section).toContain('back-to-back repeat');
    expect(section).toContain('selectRandomAvailableCourse');
    expect(section).toContain('__tests__/lib/ta/course-selection.test.ts');
    expect(taCourseSelection).toContain('do not immediately repeat');
    expect(taCourseSelectionTest).toContain('avoids the immediately previous course');
    expect(taCourseSelectionTest).toContain('only available course');
  });

  it('documents TC-2117 as course-selection public API wording coverage', () => {
    const section = e2eCaseSection('TC-2117');
    const staticTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'course-selection-dead-export.test.ts'
    );

    expect(section).toContain('issue #2117');
    expect(section).toContain('getPlayedCoursesWithSuddenDeath');
    expect(section).toContain('旧 `getPlayedCourses` export の非公開');
    expect(section).toContain('__tests__/static/course-selection-dead-export.test.ts');
    expect(staticTest).toContain(
      'exposes getPlayedCoursesWithSuddenDeath and hides obsolete getPlayedCourses'
    );
    expect(staticTest).toContain('export\\s+async\\s+function\\s+getPlayedCoursesWithSuddenDeath');
    expect(staticTest).toContain('not.toMatch(/\\bexport\\s+async\\s+function\\s+getPlayedCourses\\s*\\(/)');
  });

  it('documents TC-2114 as concise TA course-selection comment coverage', () => {
    const section = e2eCaseSection('TC-2114');

    expect(section).toContain('issue #2114');
    expect(section).toContain('immediate-repeat');
    expect(section).toContain('__tests__/lib/ta/course-selection.test.ts');
    expect(taCourseSelection).toContain(
      '// Avoid immediate-repeat courses when alternatives exist in normal and sudden-death play.',
    );
    expect(taCourseSelection).not.toContain('Keep regular rounds aligned with the previous-change behavior');
    expect(taCourseSelectionTest).toContain('keeps regular rounds on the immediate-repeat avoidance path');
  });

  it('documents TC-2286 as TA sudden-death conflict refresh-message coverage', () => {
    const section = e2eCaseSection('TC-2286');

    expect(section).toContain('issue #2286');
    expect(section).toContain('Refresh and submit again');
    expect(section).toContain('Computed targets');
    expect(section).toContain('__tests__/lib/ta/finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain(
      'Sudden-death round for phase1 changed during submission\\. Refresh and submit again\\.',
    );
    expect(taFinalsPhaseManagerTest).toContain(
      'Computed targets \\(this request\\): \\["p4","p5"\\], Stored targets \\(concurrent request\\): \\["p1","p2"\\]',
    );
  });

  it('documents TC-822A as TA sudden-death UI i18n coverage', () => {
    const section = e2eCaseSection('TC-822A');

    expect(section).toContain('issue #822');
    expect(section).toContain('suddenDeathTiebreak');
    expect(enMessages).toContain('"taSuddenDeath"');
    expect(jaMessages).toContain('"taSuddenDeath"');
    expect(taSuddenDeathPanel).toContain('useTranslations("taSuddenDeath")');
    for (const key of ['suddenDeathTiebreak', 'suddenDeathRoundDesc', 'suddenDeathCourse', 'submitSuddenDeath']) {
      expect(enMessages).toContain(`"${key}"`);
      expect(jaMessages).toContain(`"${key}"`);
      expect(taSuddenDeathPanel).toContain(`"${key}"`);
    }
    expect(taFinalsPage).toContain("'invalidTimeFor'");
    expect(taEliminationPhase).toContain("'invalidTimeFor'");
    expect(taFinalsPage).not.toContain('Submit sudden death');
    expect(taFinalsPage).not.toContain('Sudden-death tiebreak');
    expect(taFinalsPage).not.toContain('Sudden-death course');
    expect(taFinalsPage).not.toContain('Enter M:SS.mm format.');
    expect(taEliminationPhase).not.toContain('Submit sudden death');
    expect(taEliminationPhase).not.toContain('Sudden-death tiebreak');
    expect(taEliminationPhase).not.toContain('Sudden-death course');
    expect(taEliminationPhase).not.toContain('Enter M:SS.mm format.');
  });

  it('documents TC-822 as active MR scoresConfirmed coverage', () => {
    const section = e2eCaseSection('TC-822');

    expect(section).toContain('Issue**: #2076');
    expect(section).toContain('MRMatch.scoresConfirmed=true');
    expect(section).toContain('400');
    expect(tcMr).toContain("log('TC-822', mismatch && confirmRes.s === 200 && storedConfirmed && reportBlocked ? 'PASS' : 'FAIL'");
    expect(tcMr).toContain('scoresConfirmed: true');
    expect(tcMr).not.toContain("log('TC-822', 'SKIP'");
    expect(prismaSchema).toContain('scoresConfirmed Boolean @default(false)');
    expect(mrMatchRoute).toContain('body?.scoresConfirmed === true');
    expect(mrReportRoute).toContain('Scores have already been confirmed for this match');
    expect(mrReportRouteTest).toContain('should reject participant reports after admin scoresConfirmed');
  });

  it('documents TC-2108 as MR report auth-before-scoresConfirmed coverage', () => {
    const section = e2eCaseSection('TC-2108');
    const tc2108 = sectionBetween(tcMr, 'async function runTc2108', '/* ───────── TC-620');
    const authCheckIndex = mrReportRoute.indexOf('checkScoreReportAuth(request, tournamentId, reportingPlayer, match)');
    const scoresConfirmedIndex = mrReportRoute.indexOf('match.scoresConfirmed');

    expect(section).toContain('issue #2108');
    expect(section).toContain('Cookie を送らない fetch');
    expect(section).toContain('401/403');
    expect(section).toContain('tc-mr.js TC-2108');
    expect(tc2108).toContain("log('TC-2108'");
    expect(tc2108).toContain("credentials: 'omit'");
    expect(tc2108).toContain('leakedConfirmedState');
    expect(authCheckIndex).toBeGreaterThanOrEqual(0);
    expect(scoresConfirmedIndex).toBeGreaterThan(authCheckIndex);
    expect(mrReportRouteTest).toContain('should return auth failure before scoresConfirmed for unauthorized users');
  });

  it('documents TC-2109 as MR dual-report player-session coverage', () => {
    const section = e2eCaseSection('TC-2109');
    // Narrow to the TC-822 function body to avoid false positives from other functions (#2436).
    const tc822Source = sectionBetween(tcMr, 'async function runTc822', 'async function runTc2108');

    expect(section).toContain('Issue**: #2109');
    expect(section).toContain('P1 session');
    expect(section).toContain('P2 session');
    // Check function calls in the TC-822 section specifically, not the whole file.
    expect(tc822Source).toContain('loginSharedPlayer(adminPage, p1)');
    expect(tc822Source).toContain('loginSharedPlayer(adminPage, p2)');
    // p1Context.page.evaluate verifies the dual-session player-context usage.
    expect(tc822Source).toContain('p1Context.page.evaluate');
    // rejectedReport confirms post-confirm participant report is blocked (#2436).
    expect(tc822Source).toContain('rejectedReport');
  });

  it('documents TC-821A as shared TA sudden-death UI and logic coverage', () => {
    const section = e2eCaseSection('TC-821A');

    expect(section).toContain('issue #821');
    expect(section).toContain('TASuddenDeathPanel');
    expect(section).toContain('useTaSuddenDeath');
    expect(taSuddenDeathPanel).toContain('export function useTaSuddenDeath');
    expect(taSuddenDeathPanel).toContain('export function TASuddenDeathPanel');
    expect(taSuddenDeathPanel).toContain('change_sudden_death_course');
    expect(taSuddenDeathPanel).toContain('submit_sudden_death');
    expect(taFinalsPage).toContain('<TASuddenDeathSection');
    expect(taFinalsPage).toContain('useTaSuddenDeath({');
    expect(taFinalsPage).toContain("const isAdmin = session?.user?.role === 'admin'");
    expect(taEliminationPhase).toContain('<TASuddenDeathSection');
    expect(taEliminationPhase).toContain('useTaSuddenDeath({');
    expect(taEliminationPhase).toContain("const isAdmin = session?.user?.role === 'admin'");
    expect(taFinalsPage).not.toContain('change_sudden_death_course');
    expect(taFinalsPage).not.toContain('submit_sudden_death');
    expect(taEliminationPhase).not.toContain('change_sudden_death_course');
    expect(taEliminationPhase).not.toContain('submit_sudden_death');
  });

  it('documents TC-2292A as shared TA sudden-death prop-name alignment coverage', () => {
    const section = e2eCaseSection('TC-2292A');
    const panelProps = sectionBetween(
      taSuddenDeathPanel,
      'interface TASuddenDeathPanelProps',
      'export interface TASuddenDeathSectionProps',
    );
    const sectionUsage = sectionBetween(
      taSuddenDeathPanel,
      '<TASuddenDeathPanel<Entry>',
      '/>',
    );

    expect(section).toContain('issue #2292/#2290');
    expect(section).toContain('pendingSuddenDeathEntries');
    expect(section).toContain('submittingSuddenDeath');
    expect(panelProps).toContain('pendingSuddenDeathEntries: Entry[]');
    expect(panelProps).toContain('submittingSuddenDeath: boolean');
    expect(panelProps).not.toContain('entries: Entry[]');
    expect(panelProps).not.toContain('submitting: boolean');
    expect(sectionUsage).toContain('pendingSuddenDeathEntries={pendingSuddenDeathEntries}');
    expect(sectionUsage).toContain('submittingSuddenDeath={submittingSuddenDeath}');
    expect(sectionUsage).not.toContain('entries={pendingSuddenDeathEntries}');
    expect(sectionUsage).not.toContain('submitting={submittingSuddenDeath}');
    expect(taSuddenDeathPanelTest).toContain('passes pending entries and submitting state through with matching prop names');
    expect(taSuddenDeathPanelTest).toContain('submittingSuddenDeath');
  });

  it('documents TC-2293 as runnable shared TA sudden-death UI coverage', () => {
    const section = e2eCaseSection('TC-2293');

    expect(section).toContain('issue #2293');
    expect(section).toContain('/ta/finals');
    expect(section).toContain('/ta/phase1');
    expect(section).toContain('TASuddenDeathPanel');
    expect(section).toContain('course select');
    expect(section).toContain('time inputs');
    expect(section).toContain('submit button');
    expect(section).toContain('tc-ta.js');
    expect(tcTa).toContain("log('TC-2293'");
    expect(tcTa).toContain('runTc2293');
    expect(tcTa).toContain('resolveSuddenDeathThroughSharedCard');
    expect(tcTa).toContain("getByTestId('ta-sudden-death-panel')");
    expect(tcTa).toContain("getByTestId('ta-sudden-death-course-select')");
    expect(tcTa).toContain("getByTestId('ta-sudden-death-submit')");
    expect(taSuddenDeathPanel).toContain('data-testid="ta-sudden-death-panel"');
    expect(taSuddenDeathPanel).toContain('data-testid="ta-sudden-death-course-select"');
    expect(taSuddenDeathPanel).toContain('data-testid={`ta-sudden-death-time-${entry.playerId}`}');
    expect(taSuddenDeathPanel).toContain('data-testid="ta-sudden-death-submit"');
  });

  it('documents TC-1864A as shared TA sudden-death hook fetch coverage', () => {
    const section = e2eCaseSection('TC-1864A');

    expect(section).toContain('issue #1864');
    expect(section).toContain('handleSubmitSuddenDeath');
    expect(section).toContain('handleSuddenDeathCourseChange');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanelTest).toContain('submits sudden-death results');
    expect(taSuddenDeathPanelTest).toContain('reports submit API errors');
    expect(taSuddenDeathPanelTest).toContain('changes sudden-death course');
    expect(taSuddenDeathPanelTest).toContain('reports course-change API errors');
    expect(taSuddenDeathPanelTest).toContain('submit_sudden_death');
    expect(taSuddenDeathPanelTest).toContain('change_sudden_death_course');
  });

  it('documents TC-1865A as shared TA sudden-death empty-blur coverage', () => {
    const section = e2eCaseSection('TC-1865A');

    expect(section).toContain('issue #1865');
    expect(section).toContain('空入力');
    expect(section).toContain('if (!raw || raw.trim() === "") return;');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanel).toContain('if (!raw || raw.trim() === "") return;');
    expect(taSuddenDeathPanelTest).toContain('keeps empty blur as a no-op');
    expect(taSuddenDeathPanelTest).toContain('handleSuddenDeathTimeBlur');
    expect(taSuddenDeathPanelTest).toContain('suddenDeathTimes).toEqual({})');
  });

  it('documents TC-1867A as restore-safe fetch mocking coverage', () => {
    const section = e2eCaseSection('TC-1867A');

    expect(section).toContain('issue #1867');
    expect(section).toContain("jest.spyOn(global, 'fetch')");
    expect(section).toContain('global.fetch =');
    expect(section).toContain('jest.restoreAllMocks()');
    expect(taSuddenDeathPanelTest).toContain("jest.spyOn(global, 'fetch')");
    expect(taSuddenDeathPanelTest).not.toContain('global.fetch =');
    expect(taSuddenDeathPanelTest).toContain('jest.restoreAllMocks()');
  });

  it('documents TC-1868A as shared TA sudden-death blur auto-format coverage', () => {
    const section = e2eCaseSection('TC-1868A');

    expect(section).toContain('issue #1868');
    expect(section).toContain('autoFormatTime');
    expect(section).toContain('1:00.00');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanelTest).toContain('auto-formats a valid time string on blur');
    expect(taSuddenDeathPanelTest).toContain("setSuddenDeathTime('player-1', '10000')");
    expect(taSuddenDeathPanelTest).toContain("handleSuddenDeathTimeBlur('player-1')");
    expect(taSuddenDeathPanelTest).toContain("toBe('1:00.00')");
  });

  it('documents TC-1987 as TA TV number helper non-numeric normalization coverage', () => {
    const section = e2eCaseSection('TC-1987');

    expect(section).toContain('issue #1987');
    expect(section).toContain("parseTvNumberInput('abc')");
    expect(section).toContain('time-entry-layout.test.ts');
    expect(section).toContain('ta-time-entry-rows.test.tsx');
    expect(tcTa).toContain("log('TC-1987'");
    expect(tcTa).toContain("parseTvNumberInput('abc') === null");
    expect(taTimeEntryLayoutTest).toContain('expect(parseTvNumberInput("abc")).toBeNull();');
    expect(taTimeEntryRowsTest).not.toContain('parseTvNumberInput');
  });

  it('documents TC-1996 as TA finals row TV payload and persistence coverage', () => {
    const section = e2eCaseSection('TC-1996');

    expect(section).toContain('issue #1996');
    expect(section).toContain('/ta/finals');
    expect(section).toContain('submit payload');
    expect(section).toContain('単走ラウンドタイム');
    expect(section).toContain('tvNumber: 3');
    expect(section).toContain('tvNumber: null');
    expect(section).toContain('ta/phases route.test.ts');
    expect(tcTa).toContain("log('TC-1996'");
    expect(tcTa).toContain("selectOption('3')");
    expect(tcTa).toContain("capturedSubmitPayload");
    expect(tcTa).toContain('makeTaPhaseRoundTimeMs(tvEntry)');
    expect(tcTa).not.toContain('seededByPlayer.get(tvEntry.playerId)?.totalMs');
    expect(taPhasesRouteTest).toContain('should accept phase3 results with null or absent tvNumber');
  });

  it('documents TC-534 as BM Top-24 unresolved winner warning coverage', () => {
    const section = e2eCaseSection('TC-534');

    expect(section).toContain('playoff_r2');
    expect(section).toContain('winner 不定');
    expect(section).toContain('warning');
    expect(section).toContain('matchNumber');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('finals-route.test.ts');
    expect(section).toContain('server-side warning');
  });

  it('keeps TC-2234 aligned with the runnable GP Top-24 sudden-death preview coverage', () => {
    const section = e2eCaseSection('TC-2234');

    expect(section).toContain('issue #2234');
    expect(section).toContain('suddenDeathWinnerId');
    expect(section).toContain('playoff_r2');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('tc-gp.js TC-2234');
    expect(tcGp).toContain("log('TC-2234'");
    expect(tcGp).toContain('apiSetGpFinalsScore(adminPage, tournamentId, match.id, 1, 1, suddenDeathWinnerId)');
    expect(tcGp).toContain('seededWinner?.playerId === suddenDeathWinnerId');
    /* Guard for preview.raw.data absence must throw a diagnostic error (issue #2367). */
    expect(tcGp).toContain('TC-2234: preview.raw.data missing');
    expect(section).toContain('preview.raw.data');
    /* After guard, optional chaining is dead – access must be preview.raw.data.* directly (issue #2458). */
    expect(tcGp).toContain('preview.raw.data.playoffStructure');
    expect(tcGp).toContain('preview.raw.data.seededPlayers');
  });

  it('documents TC-535 as BM Top-24 qualification label coverage', () => {
    const section = e2eCaseSection('TC-535');

    expect(section).toContain('qualificationRankLabel');
    expect(section).toContain('buildQualificationRankLabelMap');
    expect(section).toContain('tc-bm.js TC-510');
    expect(section).toContain('playoff-bracket.test.tsx');
    expect(tcBm).toContain('qualificationRankLabel');
    expect(tcBm).toContain('playoffSeedLabelsOk');
    expect(tcBm).toContain('directSeedLabelsOk');
  });

  it('documents TC-1051 as the Top-24 directSeeds-only contract', () => {
    const section = e2eCaseSection('TC-1051');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'finals-group-selection.test.ts',
    );
    const runTc510OkBlock = sectionBetween(
      tcBm,
      'const ok = playoffCreated',
      "log('TC-510'",
    );

    expect(section).toContain('issue #1051');
    expect(section).toContain('legacy `direct[]`');
    expect(section).toContain('`directSeeds`');
    expect(section).toContain('tc-bm.js TC-510');
    expect(tcBm).toContain("log('TC-1051'");
    expect(tcBm).toContain('legacyDirectPayloadAbsent');
    expect(runTc510OkBlock).toContain('legacyDirectPayloadAbsent');
    expect(unitTest).toContain("does not expose the redundant direct[] projection for 2 groups");
    expect(unitTest).toContain("expect('direct' in result).toBe(false)");
  });

  it('keeps TC-1048 aligned with the shared Top-24 Phase-2 action card', () => {
    const section = e2eCaseSection('TC-1048');
    const component = readRepoFile(
      'smkc-score-app',
      'src',
      'components',
      'tournament',
      'playoff-complete-card.tsx',
    );
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-complete-card.test.tsx',
    );

    expect(section).toContain('issue #1048');
    expect(section).toContain('tc-bm.js TC-515');
    expect(section).toContain('tc-mr.js TC-615');
    expect(section).toContain('tc-gp.js TC-715');
    expect(component).toContain('export function PlayoffCompleteCard');
    expect(componentTest).toContain('Create Upper Bracket');
    for (const script of [tcBm, tcMr, tcGp]) {
      expect(script).toContain('phase2ActionVisible');
      expect(script).toContain('Create Upper Bracket action missing after playoff completion');
    }
  });

  it('keeps TC-1046 aligned with the Top-24 qualifier-count guard', () => {
    const section = e2eCaseSection('TC-1046');
    const routeFactory = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );

    expect(section).toContain('issue #1046');
    expect(section).toContain('TOP24_QUALIFIER_COUNT');
    expect(section).toContain('PLAYOFF_ENTRANT_COUNT');
    expect(section).toContain('tc-bm.js TC-1046');
    expect(tcBm).toContain("log('TC-1046'");
    expect(routeFactory).toContain('const TOP24_QUALIFIER_COUNT = 24');
    expect(unitTest).toContain('does not build a Top-16 preview when a Top-24 playoff has fewer than 24 qualifiers');
  });

  it('keeps TC-1047 aligned with Top-24 preview fallback logging and typing', () => {
    const section = e2eCaseSection('TC-1047');
    const routeFactory = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );
    const staticTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1047-top24-preview-logging.test.ts',
    );

    expect(section).toContain('issue #1047/#1045/#1628/#1630');
    expect(section).toContain('errorName・errorCode・tournamentId・eventTypeCode');
    expect(section).toContain('Error オブジェクト全体をログに渡さず');
    expect(section).toContain('コメント文言ではなくログ helper 呼び出し');
    expect(section).toContain('`any[]` / `unknown`');
    expect(routeFactory).toContain('Failed to build Top-24 finals preview');
    expect(routeFactory).toContain('getSafeErrorLogFields');
    expect(routeFactory).toContain('playoffMatches: Top24FinalsPreviewMatch[]');
    expect(staticTest).not.toContain('Do not log Error objects or messages here');
    expect(routeTest).toContain('logs and falls back when Top-24 preview construction fails');
    expect(staticTest).toContain('playoffMatches: Top24FinalsPreviewMatch[]');
  });

  it('keeps TC-1622 aligned with the BM 28-to-23 reseed guard', () => {
    const section = e2eCaseSection('TC-1622');

    expect(section).toContain('issue #1622');
    expect(section).toContain('23名に置換');
    expect(section).toContain('tc-bm.js TC-1046');
    expect(section).toContain('finals-route.test.ts');
    expect(tcBm).toContain('TC-1622');
    expect(tcBm).toContain('TC-1622 qualification count after 23-player reseed');
  });

  it('keeps TC-1612 aligned with the PlayoffCompleteCard className merge contract', () => {
    const section = e2eCaseSection('TC-1612');
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-complete-card.test.tsx',
    );

    expect(section).toContain('issue #1612');
    expect(section).toContain('border-green-500/50');
    expect(section).toContain('bg-green-500/10');
    expect(componentTest).toContain('callers provide only additional layout classes');
    expect(componentTest).toContain('className is empty');
  });

  it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage', () => {
    const section = e2eCaseSection('TC-1614');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1612DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1612 aligned with the PlayoffCompleteCard className merge contract'",
      "it('keeps TC-1614 aligned",
    );
    // Current TC-1612 guard body is substantially longer than this threshold;
    // the named lower bound catches empty/truncated extraction while allowing
    // harmless wording edits in the test body.
    const TC1612_DRIFT_MIN_BODY_LENGTH = 300;

    expect(section).toContain('issue #1614');
    expect(section).toContain('コンポーネントソースファイルの文字列詳細を検査していない');
    // Positive anchors keep the negative string checks from passing against an
    // empty extraction if the surrounding test names are refactored later.
    expect(tc1612DriftTest.length).toBeGreaterThan(TC1612_DRIFT_MIN_BODY_LENGTH);
    expect(tc1612DriftTest).toContain("const section = e2eCaseSection('TC-1612');");
    expect(tc1612DriftTest).not.toContain("'src'");
    expect(tc1612DriftTest).not.toContain("'playoff-complete-card.tsx'");
    expect(tc1612DriftTest).not.toContain('import { cn }');
    expect(tc1612DriftTest).not.toContain('className={cn(');
  });

  it('keeps TC-1616 aligned with positive extraction assertions for the TC-1614 guard', () => {
    const section = e2eCaseSection('TC-1616');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1614DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage'",
      "it('keeps TC-1616 aligned",
    );

    expect(section).toContain('issue #1616');
    expect(section).toContain('陽性アサーション');
    expect(tc1614DriftTest).toContain('toBeGreaterThan');
    expect(tc1614DriftTest).toContain('e2eCaseSection');
    expect(tc1614DriftTest.indexOf('toBeGreaterThan')).toBeLessThan(
      tc1614DriftTest.indexOf("not.toContain(\"'src'\")"),
    );
  });

  it('keeps TC-1618 and TC-1619 aligned with stable TC-1614 extraction anchors', () => {
    const tc1618 = e2eCaseSection('TC-1618');
    const tc1619 = e2eCaseSection('TC-1619');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1614DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage'",
      "it('keeps TC-1616 aligned",
    );

    expect(tc1618).toContain('issue #1618');
    expect(tc1618).toContain('先頭スペースに依存していない');
    expect(tc1619).toContain('issue #1619');
    expect(tc1619).toContain('名前付き定数');
    expect(tc1614DriftTest).not.toContain('"  it(');
    expect(tc1614DriftTest).toContain('TC1612_DRIFT_MIN_BODY_LENGTH');
    expect(tc1614DriftTest).toContain('Current TC-1612 guard body is substantially longer');
  });

  it('keeps resolveSuddenDeathThroughSharedCard using scoped option selector and state-based wait (#2380 #2381)', () => {
    // Extract only the resolveSuddenDeathThroughSharedCard function body to avoid
    // matching patterns that are legitimately used elsewhere in tc-ta.js.
    const resolveSuddenDeathSection = sectionBetween(
      tcTa,
      'async function resolveSuddenDeathThroughSharedCard(',
      'async function runTc814(',
    );
    // #2380: option click must be scoped to the shadcn/ui SelectContent element
    // (data-slot="select-content") so that other role=option elements on the page
    // cannot be accidentally selected. Note: Radix emits data-state/data-side only;
    // the data-slot attribute is added by the shadcn/ui wrapper (select.tsx).
    expect(resolveSuddenDeathSection).toContain('[data-slot="select-content"]');
    expect(resolveSuddenDeathSection).not.toMatch(/adminPage\.getByRole\('option'\)/);
    // #2381: fixed-time waitForTimeout is flaky under CI load; wait for the panel
    // to transition to hidden state instead (deterministic, not time-dependent).
    expect(resolveSuddenDeathSection).not.toContain('waitForTimeout');
    expect(resolveSuddenDeathSection).toContain("state: 'hidden'");
    // #2419: catch must use allowlist approach — only detached/closed errors are silently
    // ignored (stale element after navigation); all other errors including Timeout are
    // re-thrown. Denylist approach (Timeout check only) silently swallows unexpected errors.
    expect(resolveSuddenDeathSection).not.toContain('.catch(() => {})');
    expect(resolveSuddenDeathSection).toContain('/detached|closed/i');
    expect(resolveSuddenDeathSection).toContain('throw e');
  });

  it('keeps TC-2415 E2E scenario documenting correct shadcn/ui SelectContent attribute (#2416)', () => {
    const section = e2eCaseSection('TC-2415');
    // The correct attribute added by shadcn/ui select.tsx wrapper is data-slot="select-content",
    // not data-radix-select-content which Radix UI itself does not emit.
    expect(section).toContain('[data-slot="select-content"]');
    expect(section).not.toContain('[data-radix-select-content]');
  });

  it('keeps TC-2400 using stable sorted entry order and neutral variable names (#2401 #2402)', () => {
    // runTc2400 is the last function before getSuite; use allowTerminal to read until end.
    const tc2400Section = sectionBetween(
      tcTa,
      'async function runTc2400(',
      'function getSuite(',
    );
    // #2401: entries must be sorted by playerId before time assignment to avoid
    // fragile dependence on the API's return order.
    expect(tc2400Section).toContain('localeCompare');
    // #2402: variable names must not imply speed before time values are assigned;
    // neutral names (targetA/targetB) are used instead of slowerPlayerId/fasterPlayerId.
    expect(tc2400Section).not.toContain('slowerPlayerId');
    expect(tc2400Section).not.toContain('fasterPlayerId');
    expect(tc2400Section).toContain('targetA');
    expect(tc2400Section).toContain('targetB');
    expect(tc2400Section).toContain('expectedEliminatedId');
  });

  it('does not leave retired TC identifiers in runnable E2E scripts as false drift signals', () => {
    expect(tcAll).not.toContain('TC-403');
  });

  // TC-2460 / issue #2374 / #2368: Unit Test Coverage ラベルのドリフトガード
  it('marks TC-2235 as Unit Test Coverage to prevent browser-step confusion (#2374)', () => {
    const section = e2eCaseSection('TC-2235');
    expect(section).toContain('Unit Test Coverage');
    expect(section).toContain('ブラウザ操作なし');
    // 背景フィールドの既存内容は維持されていること
    expect(section).toContain('issue #2235');
    expect(section).toContain('Top-24');
  });

  it('marks TC-2249 as Unit Test Coverage with simplified steps (#2368)', () => {
    const section = e2eCaseSection('TC-2249');
    expect(section).toContain('Unit Test Coverage');
    expect(section).toContain('ブラウザ操作なし');
    expect(section).toContain('ユニットテストで自動検証済み');
    // 背景フィールドの既存内容は維持されていること
    expect(section).toContain('issue #2249');
    expect(section).toContain('サドンデス不参加');
    expect(section).toContain('p3');
    expect(section).toContain('__tests__/lib/ta/finals-phase-manager.test.ts');
  });

  // TC-2460: CI npm audit ステップのドリフトガード (issue #2016)
  it('documents TC-2460 as CI npm audit configuration coverage', () => {
    const section = e2eCaseSection('TC-2460');
    expect(section).toContain('issue #2016');
    expect(section).toContain('npm audit --audit-level=high');
    expect(section).toContain('ENOLOCK');
    expect(section).toContain('__tests__/docs/ci-config.test.ts');
  });

  // TC-2472〜TC-2475: Tournament Archive API ドリフトガード
  // HTTP ステータスコードとエラーコードで検証する（自然言語の表現変更に対し安定）
  it('documents TC-2472 as archive GET 403 for empty publicModes', () => {
    const section = e2eCaseSection('TC-2472');
    expect(section).toContain('403');
    expect(section).toContain('FORBIDDEN');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/archive/route.test.ts');
  });

  it('documents TC-2473 as archive GET 404 when no archive exists', () => {
    const section = e2eCaseSection('TC-2473');
    expect(section).toContain('404');
    expect(section).toContain('NOT_FOUND');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/archive/route.test.ts');
  });

  it('documents TC-2474 as archive POST 409 for non-completed tournament', () => {
    const section = e2eCaseSection('TC-2474');
    expect(section).toContain('409');
    expect(section).toContain('active');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/archive/route.test.ts');
  });

  it('documents TC-2475 as archive POST 403/401 for non-admin', () => {
    const section = e2eCaseSection('TC-2475');
    expect(section).toContain('403');
    expect(section).toContain('401');
    expect(section).toContain('admin');
    expect(section).toContain('__tests__/app/api/tournaments/[id]/archive/route.test.ts');
  });

  // TC-2476: jest.mocked(auth) 移行ドリフトガード
  it('documents TC-2476 as jest.mocked(auth) migration in auth.ts', () => {
    const section = e2eCaseSection('TC-2476');
    expect(section).toContain('jest.mocked(auth)');
    expect(section).toContain('never');
    expect(section).toContain('src/lib/auth.ts');
  });

  // TC-2477〜TC-2481: Middleware ドリフトガード
  it('documents TC-2477 as middleware 401 for unauthenticated POST', () => {
    const section = e2eCaseSection('TC-2477');
    expect(section).toContain('401');
    expect(section).toContain('POST');
    expect(section).toContain('__tests__/middleware.test.ts');
  });

  it('documents TC-2478 as middleware auth skip for GET requests', () => {
    const section = e2eCaseSection('TC-2478');
    expect(section).toContain('GET');
    expect(section).toContain('auth');
    expect(section).toContain('__tests__/middleware.test.ts');
  });

  it('documents TC-2479 as middleware redirect to /auth/signin', () => {
    const section = e2eCaseSection('TC-2479');
    expect(section).toContain('/auth/signin');
    expect(section).toContain('/profile');
    expect(section).toContain('__tests__/middleware.test.ts');
  });

  it('documents TC-2480 as middleware fallback when auth() throws', () => {
    const section = e2eCaseSection('TC-2480');
    expect(section).toContain('throw');
    expect(section).toContain('NextResponse.next()');
    expect(section).toContain('__tests__/middleware.test.ts');
  });

  it('documents TC-2481 as middleware x-nonce and x-pathname header injection', () => {
    const section = e2eCaseSection('TC-2481');
    expect(section).toContain('x-nonce');
    expect(section).toContain('x-pathname');
    expect(section).toContain('__tests__/middleware.test.ts');
  });

  // TC-2482〜TC-2487: overlay-events route ドリフトガード
  it('documents TC-2482 as overlay-events 404 when tournament not found', () => {
    const section = e2eCaseSection('TC-2482');
    expect(section).toContain('404');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2483 as overlay-events 500 on unexpected database error', () => {
    const section = e2eCaseSection('TC-2483');
    expect(section).toContain('500');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2484 as overlay-events early-return when nothing changed since `since`', () => {
    const section = e2eCaseSection('TC-2484');
    expect(section).toContain('since');
    expect(section).toContain('buildOverlayEvents');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2485 as overlay-events full-build with Cache-Control no-store', () => {
    const section = e2eCaseSection('TC-2485');
    expect(section).toContain('Cache-Control');
    expect(section).toContain('no-store');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2486 as overlay-events initial=1 bypasses early-return', () => {
    const section = e2eCaseSection('TC-2486');
    expect(section).toContain('initial');
    expect(section).toContain('buildOverlayEvents');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2487 as invalidateOverlayProbe removes probe cache entry', () => {
    const section = e2eCaseSection('TC-2487');
    expect(section).toContain('invalidateOverlayProbe');
    expect(section).toContain('overlay-events/route.test.ts');
  });

  it('documents TC-2493 as resolveAuditUserId returning undefined for null/undefined session', () => {
    const section = e2eCaseSection('TC-2493');
    const auditTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'audit-log.test.ts');
    expect(section).toContain('null');
    expect(section).toContain('audit-log.test.ts');
    expect(auditTest).toContain('TC-2493a');
    expect(auditTest).toContain('resolveAuditUserId(null)');
  });

  it('documents TC-2495 as resolveAuditUserId FK violation prevention for player sessions', () => {
    const section = e2eCaseSection('TC-2495');
    const auditTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'audit-log.test.ts');
    expect(section).toContain('#734');
    expect(section).toContain('audit-log.test.ts');
    expect(auditTest).toContain('TC-2495');
    expect(auditTest).toContain("userType: 'player'");
  });

  it('documents TC-2494 as resolveAuditUserId returning undefined when user is null', () => {
    const section = e2eCaseSection('TC-2494');
    const auditTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'audit-log.test.ts');
    expect(section).toContain('null');
    expect(section).toContain('audit-log.test.ts');
    expect(auditTest).toContain('TC-2494a');
    expect(auditTest).toContain('user: null');
  });

  it('documents TC-2496 as resolveAuditUserId returning user.id for admin sessions', () => {
    const section = e2eCaseSection('TC-2496');
    const auditTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'audit-log.test.ts');
    expect(section).toContain('admin');
    expect(section).toContain('audit-log.test.ts');
    expect(auditTest).toContain('TC-2496a');
    expect(auditTest).toContain("userType: 'admin'");
  });

  it('documents TC-2497 as resolveAuditUserId returning undefined when admin user.id is undefined', () => {
    const section = e2eCaseSection('TC-2497');
    const auditTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'audit-log.test.ts');
    expect(section).toContain('undefined');
    expect(section).toContain('audit-log.test.ts');
    expect(auditTest).toContain('TC-2497');
    expect(auditTest).toContain('id: undefined'); // user.id が undefined のケースを具体的にカバー
  });

  it('documents TC-2498 as requireAdminSession returning error for null session', () => {
    const section = e2eCaseSection('TC-2498');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('null');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2498');
    expect(apiAuthTest).toContain('requireAdminSession');
  });

  it('documents TC-2499 as requireAdminSession returning error when session has no user', () => {
    const section = e2eCaseSection('TC-2499');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('{}'); // "user なしセッション ({})" scenario-specific token
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2499');
    expect(apiAuthTest).toContain('requireAdminSession');
  });

  it('documents TC-2500 as requireAdminSession returning error for player role', () => {
    const section = e2eCaseSection('TC-2500');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('player');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2500');
    expect(apiAuthTest).toContain("role: 'player'");
  });

  it('documents TC-2501 as requireAdminSession returning session for admin role', () => {
    const section = e2eCaseSection('TC-2501');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('admin');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2501');
    expect(apiAuthTest).toContain("role: 'admin'");
  });

  it('documents TC-2502 as requireAdminOrPlayerSession returning error for null session', () => {
    const section = e2eCaseSection('TC-2502');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('null');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2502');
    expect(apiAuthTest).toContain('requireAdminOrPlayerSession');
  });

  it('documents TC-2503 as requireAdminOrPlayerSession returning session for admin role', () => {
    const section = e2eCaseSection('TC-2503');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('requireAdminOrPlayerSession'); // scenario-specific: distinguishes TC-2503 from TC-2501 which tests requireAdminSession
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2503');
    expect(apiAuthTest).toContain("role: 'admin'");
  });

  it('documents TC-2504 as requireAdminOrPlayerSession returning session for player userType', () => {
    const section = e2eCaseSection('TC-2504');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('player');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2504');
    expect(apiAuthTest).toContain("userType: 'player'");
  });

  it('documents TC-2505 as requireAdminOrPlayerSession returning error for non-admin non-player session', () => {
    const section = e2eCaseSection('TC-2505');
    const apiAuthTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'api-auth.test.ts');
    expect(section).toContain('guest');
    expect(section).toContain('api-auth.test.ts');
    expect(apiAuthTest).toContain('TC-2505');
    expect(apiAuthTest).toContain("role: 'guest'");
  });

  it('documents TC-2506 as score-entry-logs returning 403 for player role', () => {
    const section = e2eCaseSection('TC-2506');
    const routeTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'api', 'tournaments', '[id]', 'score-entry-logs', 'route.test.ts');
    expect(section).toContain('player');
    expect(section).toContain('route.test.ts');
    expect(routeTest).toContain('TC-2506');
    expect(routeTest).toContain("role: 'player'");
  });

  it('documents TC-2507 as score-entry-logs returning logs grouped by matchId for admin', () => {
    const section = e2eCaseSection('TC-2507');
    const routeTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'api', 'tournaments', '[id]', 'score-entry-logs', 'route.test.ts');
    expect(section).toContain('matchId');
    expect(section).toContain('route.test.ts');
    expect(routeTest).toContain('TC-2507');
    expect(routeTest).toContain('logsByMatch');
  });

  it('documents TC-2508 as score-entry-logs returning empty logsByMatch when no logs exist', () => {
    const section = e2eCaseSection('TC-2508');
    const routeTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'api', 'tournaments', '[id]', 'score-entry-logs', 'route.test.ts');
    expect(section).toContain('totalCount: 0');
    expect(section).toContain('route.test.ts');
    expect(routeTest).toContain('TC-2508');
    expect(routeTest).toContain('totalCount: 0');
  });

  it('documents TC-2509 as score-entry-logs querying with orderBy timestamp descending', () => {
    const section = e2eCaseSection('TC-2509');
    const routeTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'api', 'tournaments', '[id]', 'score-entry-logs', 'route.test.ts');
    expect(section).toContain('orderBy');
    expect(section).toContain('desc');
    expect(section).toContain('route.test.ts');
    expect(routeTest).toContain('TC-2509');
    expect(routeTest).toContain("orderBy: { timestamp: 'desc' }");
  });

  it('documents TC-2510 as retryDbRead returning result on first successful attempt', () => {
    const section = e2eCaseSection('TC-2510');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2510');
    expect(dbRetryTest).toContain('result-value');
  });

  it('documents TC-2511 as retryDbRead retrying after one failure and returning result', () => {
    const section = e2eCaseSection('TC-2511');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2511');
    expect(dbRetryTest).toContain('retry-success');
  });

  it('documents TC-2512 as retryDbRead throwing last error after exhausting all attempts', () => {
    const section = e2eCaseSection('TC-2512');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2512');
    expect(dbRetryTest).toContain('rejects.toThrow');
  });

  it('documents TC-2513 as retryDbRead respecting custom attempts option', () => {
    const section = e2eCaseSection('TC-2513');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2513');
    expect(dbRetryTest).toContain('attempts: 3');
  });

  it('documents TC-2514 as retryDbRead calling onRetry with attempt number and error', () => {
    const section = e2eCaseSection('TC-2514');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2514');
    expect(dbRetryTest).toContain('onRetry');
  });

  it('documents TC-2515 as retryDbRead not retrying when attempts is 1', () => {
    const section = e2eCaseSection('TC-2515');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2515');
    expect(dbRetryTest).toContain('attempts: 1');
    expect(dbRetryTest).toContain('single-attempt-fail');
  });

  it('documents TC-2518 as retryDbRead not calling onRetry on the final failed attempt', () => {
    const section = e2eCaseSection('TC-2518');
    const dbRetryTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'db-read-retry.test.ts');
    expect(section).toContain('db-read-retry.test.ts');
    expect(dbRetryTest).toContain('TC-2518');
    expect(dbRetryTest).toContain('toHaveBeenCalledTimes(1)');
    expect(dbRetryTest).toContain('always-fails');
  });

  it('documents TC-2516 as getTabHydrationGuardProps returning enabled props when hydrated', () => {
    const section = e2eCaseSection('TC-2516');
    const tabHydrationTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'tournament-tab-hydration.test.ts');
    expect(section).toContain('tournament-tab-hydration.test.ts');
    expect(tabHydrationTest).toContain('TC-2516');
    expect(tabHydrationTest).toContain('toBeUndefined');
  });

  it('documents TC-2517 as getTabHydrationGuardProps returning disabled props when not hydrated', () => {
    const section = e2eCaseSection('TC-2517');
    const tabHydrationTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'tournament-tab-hydration.test.ts');
    expect(section).toContain('tournament-tab-hydration.test.ts');
    expect(tabHydrationTest).toContain('TC-2517');
    expect(tabHydrationTest).toContain('pointer-events-none');
  });

  describe('perf/query-counter drift guards (TC-2519–2525, TC-2540–2541)', () => {
    let qcTest: string;
    beforeAll(() => {
      qcTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'perf', 'query-counter.test.ts');
    });

    it('documents TC-2519 as runWithQueryStats returning the result of fn', () => {
      const section = e2eCaseSection('TC-2519');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2519');
      // result.result はリターン値の転送パターンを表す。特定のリテラル値ではなくプロパティ名を確認する (#2539)。
      expect(qcTest).toContain('result.result');
    });

    it('documents TC-2520 as runWithQueryStats starting with count=0 and totalDurationMs=0', () => {
      const section = e2eCaseSection('TC-2520');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2520');
      expect(qcTest).toContain('count');
      expect(qcTest).toContain('totalDurationMs');
    });

    it('documents TC-2521 as recordQuery accumulating count and totalDurationMs in a scope', () => {
      const section = e2eCaseSection('TC-2521');
      expect(section).toContain('query-counter.test.ts');
      expect(section).toContain('AsyncLocalStorage');
      expect(qcTest).toContain('TC-2521');
      expect(qcTest).toContain('totalDurationMs');
      // recordQuery 呼び出しパターンで振る舞いを確認する。合計値の特定リテラルは除外 (#2539)。
      expect(qcTest).toContain('recordQuery');
    });

    it('documents TC-2522 as recordQuery being a no-op outside a scope', () => {
      const section = e2eCaseSection('TC-2522');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2522');
      // テスト説明の "does not throw" は振る舞いキーワードとして安定している (#2539)。
      expect(qcTest).toContain('does not throw');
    });

    it('documents TC-2523 as getCurrentStats returning stats object inside a scope', () => {
      const section = e2eCaseSection('TC-2523');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2523');
      expect(qcTest).toContain('getCurrentStats');
      expect(qcTest).toContain('toBeDefined');
    });

    it('documents TC-2524 as getCurrentStats returning undefined outside a scope', () => {
      const section = e2eCaseSection('TC-2524');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2524');
      expect(qcTest).toContain('toBeUndefined');
    });

    it('documents TC-2525 as multiple recordQuery calls accumulating totalDurationMs correctly', () => {
      const section = e2eCaseSection('TC-2525');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2525');
      // "accumulate" は振る舞いを表す語句であり、特定の合計値リテラルより堅牢 (#2539)。
      expect(qcTest).toContain('accumulate');
    });

    it('documents TC-2540 as runWithQueryStats propagating fn rejection (noop path)', () => {
      const section = e2eCaseSection('TC-2540');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2540');
      expect(qcTest).toContain('rejects.toThrow');
    });

    it('documents TC-2541 as runWithQueryStats propagating fn rejection (ALS path)', () => {
      const section = e2eCaseSection('TC-2541');
      expect(section).toContain('query-counter.test.ts');
      expect(qcTest).toContain('TC-2541');
      expect(qcTest).toContain('rejects.toThrow');
    });
  });

  describe('perf/api-timing drift guards (TC-2526–2528, TC-2542–2543)', () => {
    let atTest: string;
    beforeAll(() => {
      atTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'perf', 'api-timing.test.ts');
    });

    it('documents TC-2526 as withApiTiming passing through without logging when PERF_LOG is unset', () => {
      const section = e2eCaseSection('TC-2526');
      expect(section).toContain('api-timing.test.ts');
      expect(atTest).toContain('TC-2526');
      expect(atTest).toContain('PERF_LOG');
      expect(atTest).toContain('not.toHaveBeenCalled');
    });

    it('documents TC-2527 as withApiTiming logging request stats when PERF_LOG=1', () => {
      const section = e2eCaseSection('TC-2527');
      expect(section).toContain('api-timing.test.ts');
      expect(section).toContain('PERF_LOG');
      expect(atTest).toContain('TC-2527');
      expect(atTest).toContain('api_request_ms');
    });

    it('documents TC-2528 as withApiTiming skipping log when below PERF_SLOW_REQUEST_MS threshold', () => {
      const section = e2eCaseSection('TC-2528');
      expect(section).toContain('api-timing.test.ts');
      expect(section).toContain('PERF_SLOW_REQUEST_MS');
      expect(atTest).toContain('TC-2528');
      expect(atTest).toContain('PERF_SLOW_REQUEST_MS');
    });

    it('documents TC-2542 as withApiTiming propagating fn rejection in passthrough mode', () => {
      const section = e2eCaseSection('TC-2542');
      expect(section).toContain('api-timing.test.ts');
      expect(atTest).toContain('TC-2542');
      expect(atTest).toContain('rejects.toThrow');
    });

    it('documents TC-2543 as withApiTiming propagating fn rejection when PERF_LOG=1', () => {
      const section = e2eCaseSection('TC-2543');
      expect(section).toContain('api-timing.test.ts');
      expect(atTest).toContain('TC-2543');
      expect(atTest).toContain('rejects.toThrow');
      expect(atTest).toContain('not.toHaveBeenCalled');
    });
  });

  describe('cdm-export/time-format drift guards (TC-2544–2554)', () => {
    let tfTest: string;
    beforeAll(() => {
      tfTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'cdm-export', 'time-format.test.ts');
    });

    it('documents TC-2544 as msToCdmTime encoding 1:10.34 as MSSCC 11034', () => {
      const section = e2eCaseSection('TC-2544');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2544');
      expect(tfTest).toContain('11034');
    });

    it('documents TC-2545 as msToCdmTime encoding 0:59.79 as MSSCC 5979', () => {
      const section = e2eCaseSection('TC-2545');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2545');
      expect(tfTest).toContain('5979');
    });

    it('documents TC-2546 as msToCdmTime encoding 0ms as 0', () => {
      const section = e2eCaseSection('TC-2546');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2546');
      // 出力値 0 は toBe(0) 等でも使われる汎用リテラルなので出力値確認は省略する (#2542)。
    });

    it('documents TC-2547 as msToCdmTime rounding 155ms to 16cs', () => {
      const section = e2eCaseSection('TC-2547');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2547');
      expect(tfTest).toContain('155');
      // '16' は汎用的な数値リテラルなので toBe(16) の形式で確認し一意性を高める (#2545)
      expect(tfTest).toContain('toBe(16)');
    });

    it('documents TC-2548 as msToCdmTime throwing for negative duration', () => {
      const section = e2eCaseSection('TC-2548');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2548');
      expect(tfTest).toContain('-1');
    });

    it('documents TC-2549 as msToCdmTime throwing for NaN, +Infinity, and -Infinity', () => {
      const section = e2eCaseSection('TC-2549');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2549');
      expect(tfTest).toContain('NaN');
      expect(tfTest).toContain('Infinity');
      expect(tfTest).toContain('-Infinity');
    });

    it('documents TC-2550 as timeStringToCdmTime encoding "1:10.34" as 11034', () => {
      const section = e2eCaseSection('TC-2550');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2550');
      expect(tfTest).toContain('timeStringToCdmTime');
    });

    it('documents TC-2551 as timeStringToCdmTime returning null for non-string input', () => {
      const section = e2eCaseSection('TC-2551');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2551');
      expect(tfTest).toContain('toBeNull');
    });

    it('documents TC-2552 as timeStringToCdmTime returning null for empty strings', () => {
      const section = e2eCaseSection('TC-2552');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2552');
      expect(tfTest).toContain('toBeNull');
    });

    it('documents TC-2553 as timeStringToCdmTime returning null for unparsable strings', () => {
      const section = e2eCaseSection('TC-2553');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2553');
      expect(tfTest).toContain('not-a-time');
    });

    it('documents TC-2554 as msToCdmTime rounding 59995ms up to MSSCC 10000 (1:00.00)', () => {
      const section = e2eCaseSection('TC-2554');
      expect(section).toContain('time-format.test.ts');
      expect(tfTest).toContain('TC-2554');
      expect(tfTest).toContain('59995');
      expect(tfTest).toContain('10000');
    });

    it('documents TC-2555 as overlay-events using toHaveLength Jest idiom', () => {
      const section = e2eCaseSection('TC-2555');
      expect(section).toContain('overlay-events/route.test.ts');
      const overlayTest = readRepoFile(
        'smkc-score-app', '__tests__', 'app', 'api', 'tournaments', '[id]', 'overlay-events', 'route.test.ts'
      );
      // TC-2555: expect(array).toHaveLength(n) preferred over expect(array.length).toBe(n) (#2562)
      expect(overlayTest).toContain('TC-2555');
      expect(overlayTest).toContain('toHaveLength');
      expect(overlayTest).not.toContain('.length).toBe(1)');
    });

    it('documents TC-2556 as api-factories using handleAuthzError() for Forbidden responses', () => {
      const section = e2eCaseSection('TC-2556');
      expect(section).toContain('api-factories/');
      const factoryFiles = [
        'standings-route.ts',
        'qualification-route.ts',
        'finals-bracket-route.ts',
        'finals-route.ts',
        'match-detail-route.ts',
        'finals-matches-route.ts',
      ];
      for (const file of factoryFiles) {
        const src = readRepoFile('smkc-score-app', 'src', 'lib', 'api-factories', file);
        // TC-2556: handleAuthzError() must replace createErrorResponse('Forbidden', 403, 'FORBIDDEN') (#2563)
        expect(src).not.toContain("createErrorResponse('Forbidden', 403, 'FORBIDDEN')");
      }
    });

    it('documents TC-2557 through TC-2566 as replayTTFinals unit tests in tt-lives-replay.test.ts', () => {
      const replayTest = readRepoFile(
        'smkc-score-app',
        '__tests__',
        'lib',
        'cdm-export',
        'fill',
        'tt-lives-replay.test.ts',
      );
      for (const tc of ['TC-2557', 'TC-2558', 'TC-2559', 'TC-2560', 'TC-2561', 'TC-2562', 'TC-2563', 'TC-2564', 'TC-2565', 'TC-2566']) {
        expect(replayTest).toContain(tc);
      }
    });

    it('documents TC-2567 and TC-2568 as displayRowOrder stable-sort unit tests in tt-finals.test.ts', () => {
      const finalsTest = readRepoFile(
        'smkc-score-app',
        '__tests__',
        'lib',
        'cdm-export',
        'fill',
        'tt-finals.test.ts',
      );
      for (const tc of ['TC-2567', 'TC-2568']) {
        expect(finalsTest).toContain(tc);
      }
    });

    it('documents TC-2569 through TC-2576 as fetchQualInitialData unit tests in qual-initial-data.test.ts', () => {
      const qualTest = readRepoFile(
        'smkc-score-app',
        '__tests__',
        'lib',
        'api-factories',
        'qual-initial-data.test.ts',
      );
      for (const tc of ['TC-2569', 'TC-2570', 'TC-2571', 'TC-2572', 'TC-2573', 'TC-2574', 'TC-2575', 'TC-2576']) {
        expect(qualTest).toContain(tc);
      }
      // Verifies the function under test is fetchQualInitialData
      expect(qualTest).toContain('fetchQualInitialData');
    });

    it('documents TC-2577 through TC-2579 as matches-polling-route unit tests in matches-polling-route.test.ts', () => {
      const pollingTest = readRepoFile(
        'smkc-score-app',
        '__tests__',
        'lib',
        'api-factories',
        'matches-polling-route.test.ts',
      );
      for (const tc of ['TC-2577', 'TC-2578', 'TC-2579']) {
        expect(pollingTest).toContain(tc);
      }
      expect(pollingTest).toContain('createMatchesPollingHandlers');
    });
  });
});

