#!/usr/bin/env node

function readBaseUrlArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base-url' && argv[i + 1]) return argv[i + 1];
    if (arg.startsWith('--base-url=')) return arg.slice('--base-url='.length);
  }
  return null;
}

const baseUrlArg = readBaseUrlArg(process.argv);
if (baseUrlArg) {
  process.env.E2E_BASE_URL = baseUrlArg;
}

const { chromium } = require('playwright');
const {
  BASE,
  installApiLogging,
  resolveAllTies,
} = require('../e2e/lib/common');
const { closeBrowser, envMs, formatDuration } = require('../e2e/lib/runner');

const DEFAULT_PROFILE_DIR = process.env.E2E_PROFILE_DIR || '/tmp/playwright-smkc-profile';
const DEFAULT_MODES = ['bm', 'mr', 'gp'];
const SUPPORTED_MODES = ['bm', 'mr', 'gp'];

function printUsage() {
  console.log([
    'Re-apply qualification rankOverride values for an existing tournament.',
    '',
    'Usage:',
    '  node scripts/reapply-rank-overrides.js --tournament <id-or-slug> [options]',
    '',
    'Options:',
    '  --tournament <id-or-slug>  Target tournament id or slug',
    '  --modes <csv>              Modes to process. Default: bm,mr,gp',
    '  --profile-dir <dir>        Playwright profile with admin session',
    '  --base-url <url>           Target app URL. Default: https://smkc.bluemoon.works',
    '  --headless                 Run Chromium headless',
    '  --help                     Show this help',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    tournament: null,
    modes: DEFAULT_MODES.slice(),
    profileDir: DEFAULT_PROFILE_DIR,
    headless: process.env.E2E_HEADLESS === '1',
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--headless') {
      options.headless = true;
      continue;
    }

    const readValue = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return next;
    };

    if (arg === '--tournament') {
      options.tournament = readValue();
      continue;
    }
    if (arg === '--modes') {
      options.modes = readValue()
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      continue;
    }
    if (arg === '--profile-dir') {
      options.profileDir = readValue();
      continue;
    }
    if (arg === '--base-url') {
      readValue();
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      continue;
    }
    if (arg.startsWith('--tournament=')) {
      options.tournament = arg.slice('--tournament='.length);
      continue;
    }
    if (arg.startsWith('--modes=')) {
      options.modes = arg.slice('--modes='.length)
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith('--profile-dir=')) {
      options.profileDir = arg.slice('--profile-dir='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.tournament && !options.help) {
    throw new Error('--tournament is required');
  }

  const uniqueModes = [...new Set(options.modes)];
  const invalidModes = uniqueModes.filter((mode) => !SUPPORTED_MODES.includes(mode));
  if (invalidModes.length > 0) {
    throw new Error(`Unsupported mode(s): ${invalidModes.join(', ')}`);
  }
  options.modes = SUPPORTED_MODES.filter((mode) => uniqueModes.includes(mode));

  return options;
}

async function fetchSessionStatus(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/auth/session-status');
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
}

async function fetchAuthSession(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return { status: res.status, body: await res.json().catch(() => null) };
  });
}

async function ensureAdminSession(page, profileDir) {
  const statusRes = await fetchSessionStatus(page);
  const statusData = statusRes.body?.data || {};
  const authSession = await fetchAuthSession(page);
  const sessionUser = authSession.body?.user || {};

  if (
    statusRes.status !== 200 ||
    statusData.authenticated !== true ||
    authSession.status !== 200 ||
    sessionUser.role !== 'admin'
  ) {
    throw new Error(
      `Admin session was not confirmed in ${profileDir}. ` +
      'Log in with the Playwright profile first, then rerun this script.',
    );
  }
}

async function fetchQualifications(page, tournamentKey, mode) {
  const response = await page.evaluate(async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, `/api/tournaments/${tournamentKey}/${mode}`);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GET /api/tournaments/${tournamentKey}/${mode} failed (${response.status})`);
  }
  return response.body?.data?.qualifications || response.body?.qualifications || [];
}

function compareQualification(mode, a, b) {
  return mode === 'gp'
    ? b.points - a.points || b.score - a.score
    : b.score - a.score || b.points - a.points;
}

function summarizeUnresolvedTies(mode, qualifications) {
  const byGroup = qualifications.reduce((acc, qualification) => {
    if (!acc[qualification.group]) acc[qualification.group] = [];
    acc[qualification.group].push(qualification);
    return acc;
  }, {});

  const unresolved = [];
  for (const [group, entries] of Object.entries(byGroup)) {
    const sorted = [...entries].sort((a, b) => compareQualification(mode, a, b));
    let previous = null;
    let autoRank = 1;
    const rankGroups = new Map();

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (previous && compareQualification(mode, previous, entry) !== 0) {
        autoRank = i + 1;
      }
      if (!rankGroups.has(autoRank)) rankGroups.set(autoRank, []);
      rankGroups.get(autoRank).push(entry);
      previous = entry;
    }

    for (const [rank, tiedQualifications] of rankGroups.entries()) {
      if (tiedQualifications.length <= 1) continue;
      if (!tiedQualifications.some((qualification) => (qualification.mp ?? 0) > 0)) continue;

      const setOverrides = tiedQualifications
        .map((qualification) => qualification.rankOverride)
        .filter((value) => value != null);
      const distinctOverrides = new Set(setOverrides).size;
      const noDuplicateOverrides = distinctOverrides === setOverrides.length;
      const resolved = noDuplicateOverrides && distinctOverrides >= tiedQualifications.length - 1;
      if (!resolved) {
        unresolved.push({
          group,
          rank,
          players: tiedQualifications.map((qualification) => ({
            nickname: qualification.player?.nickname,
            rankOverride: qualification.rankOverride,
            score: qualification.score,
            points: qualification.points,
          })),
        });
      }
    }
  }

  return unresolved;
}

function formatUnresolvedSummary(unresolved) {
  if (unresolved.length === 0) return 'none';
  return unresolved.map((entry) => {
    const players = entry.players
      .map((player) => `${player.nickname}(ro=${player.rankOverride ?? 'null'},score=${player.score},pts=${player.points})`)
      .join(', ');
    return `group ${entry.group} rank ${entry.rank}: ${players}`;
  }).join(' | ');
}

async function processMode(page, tournamentKey, mode) {
  const beforeQualifications = await fetchQualifications(page, tournamentKey, mode);
  const before = summarizeUnresolvedTies(mode, beforeQualifications);
  console.log(`[${mode}] unresolved before: ${before.length}`);
  if (before.length > 0) {
    console.log(`[${mode}] ${formatUnresolvedSummary(before)}`);
  }

  await resolveAllTies(page, tournamentKey, mode);
  await page.waitForTimeout(1000);

  const afterQualifications = await fetchQualifications(page, tournamentKey, mode);
  const after = summarizeUnresolvedTies(mode, afterQualifications);
  console.log(`[${mode}] unresolved after: ${after.length}`);
  if (after.length > 0) {
    console.log(`[${mode}] ${formatUnresolvedSummary(after)}`);
  }

  if (after.length > 0) {
    throw new Error(`Unresolved ties remain for ${mode}`);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const started = Date.now();
  let browser = null;

  try {
    console.log(`[rank-override] target: ${BASE}`);
    console.log(`[rank-override] profile: ${options.profileDir}`);
    console.log(`[rank-override] tournament: ${options.tournament}`);
    console.log(`[rank-override] modes: ${options.modes.join(', ')}`);

    browser = await chromium.launchPersistentContext(options.profileDir, {
      headless: options.headless,
      viewport: { width: 1280, height: 720 },
    });
    installApiLogging(browser, 'rank-override');

    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

    await page.goto(BASE + '/', {
      waitUntil: 'domcontentloaded',
      timeout: envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000),
    });

    await ensureAdminSession(page, options.profileDir);

    for (const mode of options.modes) {
      await processMode(page, options.tournament, mode);
    }

    console.log(`[rank-override] finished in ${formatDuration(Date.now() - started)}`);
    return 0;
  } catch (error) {
    console.error('[rank-override] failed:', error instanceof Error ? error.stack || error.message : error);
    return 1;
  } finally {
    await closeBrowser(browser);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[rank-override] fatal:', error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
