#!/usr/bin/env node

function readBaseUrlArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base-url' && argv[i + 1]) {
      return argv[i + 1];
    }
    if (arg.startsWith('--base-url=')) {
      return arg.slice('--base-url='.length);
    }
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
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  setupBmQualViaUi,
  setupMrQualViaUi,
  setupGpQualViaUi,
  setupTaQualViaUi,
  apiGenerateBmFinals,
  apiGenerateMrFinals,
  apiGenerateGpFinals,
  uiFreezeTaQualification,
} = require('../e2e/lib/common');
const { closeBrowser, envMs, formatDuration } = require('../e2e/lib/runner');

const DEFAULT_PROFILE_DIR = process.env.E2E_PROFILE_DIR || '/tmp/playwright-smkc-profile';
const DEFAULT_MODES = ['bm', 'mr', 'gp'];
const SUPPORTED_MODES = ['bm', 'mr', 'gp', 'ta'];
const PLAYER_COUNT = 28;

function printUsage() {
  console.log([
    'Create a production finals-ready tournament using the existing admin browser session.',
    '',
    'Usage:',
    '  node scripts/create-finals-ready-tournament.js [options]',
    '',
    'Options:',
    '  --name <name>            Tournament name',
    '  --slug <slug>            Tournament slug',
    '  --modes <csv>            Modes to prepare. Default: bm,mr,gp',
    '  --top-n <8|16>           Finals bracket size for BM/MR/GP. Default: 8',
    '  --no-generate-finals     Leave BM/MR/GP at qualification-complete state',
    '  --keep-on-fail           Do not delete created data when setup fails',
    '  --profile-dir <dir>      Playwright profile with admin session',
    '  --base-url <url>         Target app URL. Default: https://smkc.bluemoon.works',
    '  --headless               Run Chromium headless',
    '  --help                   Show this help',
    '',
    'Notes:',
    '  - BM/MR/GP use 28 players with qualification fully entered.',
    '  - qualificationConfirmed is intentionally NOT enabled because it blocks finals POST/PUT.',
    '  - If TA is included, qualification times are seeded and the TA qualification stage is frozen.',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    name: null,
    slug: null,
    modes: DEFAULT_MODES.slice(),
    topN: 8,
    generateFinals: true,
    keepOnFail: false,
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
    if (arg === '--no-generate-finals') {
      options.generateFinals = false;
      continue;
    }
    if (arg === '--keep-on-fail') {
      options.keepOnFail = true;
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

    if (arg === '--name') {
      options.name = readValue();
      continue;
    }
    if (arg === '--slug') {
      options.slug = readValue();
      continue;
    }
    if (arg === '--modes') {
      options.modes = readValue()
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      continue;
    }
    if (arg === '--top-n') {
      options.topN = Number(readValue());
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
    if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length);
      continue;
    }
    if (arg.startsWith('--slug=')) {
      options.slug = arg.slice('--slug='.length);
      continue;
    }
    if (arg.startsWith('--modes=')) {
      options.modes = arg.slice('--modes='.length)
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith('--top-n=')) {
      options.topN = Number(arg.slice('--top-n='.length));
      continue;
    }
    if (arg.startsWith('--profile-dir=')) {
      options.profileDir = arg.slice('--profile-dir='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.modes.length === 0) {
    throw new Error('At least one mode must be selected');
  }

  const uniqueModes = [...new Set(options.modes)];
  const invalidModes = uniqueModes.filter((mode) => !SUPPORTED_MODES.includes(mode));
  if (invalidModes.length > 0) {
    throw new Error(`Unsupported mode(s): ${invalidModes.join(', ')}`);
  }
  options.modes = SUPPORTED_MODES.filter((mode) => uniqueModes.includes(mode));

  if (options.topN !== 8 && options.topN !== 16) {
    throw new Error('--top-n must be 8 or 16');
  }

  return options;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function makeStampParts(now = new Date()) {
  return {
    compact: [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate()),
      pad2(now.getHours()),
      pad2(now.getMinutes()),
      pad2(now.getSeconds()),
    ].join(''),
    readable: [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate()),
    ].join('-') + ' ' + [
      pad2(now.getHours()),
      pad2(now.getMinutes()),
      pad2(now.getSeconds()),
    ].join(':'),
  };
}

function makeDefaults(options) {
  const stamp = makeStampParts();
  const slug = options.slug || `finals-ready-${stamp.compact}`;
  const name = options.name || `Finals Ready ${stamp.readable}`;
  const nicknamePrefix = `finals_ready_${stamp.compact}`;
  return { slug, name, nicknamePrefix };
}

function assertOk(response, context) {
  if (response.s >= 200 && response.s < 300) {
    return;
  }
  const detail = JSON.stringify(response.b || {}).slice(0, 400);
  throw new Error(`${context} failed (${response.s}): ${detail}`);
}

async function fetchSessionStatus(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/auth/session-status');
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
}

async function ensureAdminSession(page, profileDir) {
  const session = await fetchSessionStatus(page);
  const data = session.body?.data || {};
  if (session.status !== 200 || data.authenticated !== true || data.role !== 'admin') {
    throw new Error(
      `Admin session was not confirmed in ${profileDir}. ` +
      'Log in with the Playwright profile first, then rerun this script.',
    );
  }
}

function makePlayers(nicknamePrefix) {
  const players = [];
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const suffix = pad2(i);
    players.push({
      name: `Finals Ready P${suffix}`,
      nickname: `${nicknamePrefix}_${suffix}`,
    });
  }
  return players;
}

async function createPlayers(page, nicknamePrefix) {
  const players = [];
  const templates = makePlayers(nicknamePrefix);

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    console.log(`[create] player ${i + 1}/${templates.length}: ${template.nickname}`);
    const created = await apiCreatePlayer(page, template.name, template.nickname);
    players.push({
      id: created.id,
      name: template.name,
      nickname: template.nickname,
      password: created.password,
    });
  }

  return players;
}

async function prepareMode(page, tournamentId, mode, players, options) {
  if (mode === 'bm') {
    console.log('[mode] BM qualification setup');
    await setupBmQualViaUi(page, tournamentId, players);
    if (options.generateFinals) {
      console.log(`[mode] BM finals bracket generation (top ${options.topN})`);
      assertOk(await apiGenerateBmFinals(page, tournamentId, options.topN), 'BM finals generation');
    }
    return;
  }

  if (mode === 'mr') {
    console.log('[mode] MR qualification setup');
    await setupMrQualViaUi(page, tournamentId, players);
    if (options.generateFinals) {
      console.log(`[mode] MR finals bracket generation (top ${options.topN})`);
      assertOk(await apiGenerateMrFinals(page, tournamentId, options.topN), 'MR finals generation');
    }
    return;
  }

  if (mode === 'gp') {
    console.log('[mode] GP qualification setup');
    await setupGpQualViaUi(page, tournamentId, players);
    if (options.generateFinals) {
      console.log(`[mode] GP finals bracket generation (top ${options.topN})`);
      assertOk(await apiGenerateGpFinals(page, tournamentId, options.topN), 'GP finals generation');
    }
    return;
  }

  if (mode === 'ta') {
    console.log('[mode] TA qualification setup');
    await setupTaQualViaUi(page, tournamentId, players);
    console.log('[mode] TA qualification freeze');
    await uiFreezeTaQualification(page, tournamentId);
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

function printSummary({ tournamentId, routeKey, name, slug, players, options }) {
  console.log('');
  console.log('Created finals-ready tournament');
  console.log(`  id: ${tournamentId}`);
  console.log(`  name: ${name}`);
  console.log(`  slug: ${slug}`);
  console.log(`  modes: ${options.modes.join(', ')}`);
  console.log(`  players: ${players.length}`);
  if (options.generateFinals) {
    const finalsModes = options.modes.filter((mode) => mode !== 'ta');
    if (finalsModes.length > 0) {
      console.log(`  generated finals: ${finalsModes.join(', ')} (top ${options.topN})`);
    }
  }
  console.log('');
  console.log(`Tournament: ${BASE}/tournaments/${routeKey}`);

  if (options.modes.includes('bm')) {
    console.log(`BM: ${BASE}/tournaments/${routeKey}/bm`);
    if (options.generateFinals) console.log(`BM finals: ${BASE}/tournaments/${routeKey}/bm/finals`);
  }
  if (options.modes.includes('mr')) {
    console.log(`MR: ${BASE}/tournaments/${routeKey}/mr`);
    if (options.generateFinals) console.log(`MR finals: ${BASE}/tournaments/${routeKey}/mr/finals`);
  }
  if (options.modes.includes('gp')) {
    console.log(`GP: ${BASE}/tournaments/${routeKey}/gp`);
    if (options.generateFinals) console.log(`GP finals: ${BASE}/tournaments/${routeKey}/gp/finals`);
  }
  if (options.modes.includes('ta')) {
    console.log(`TA: ${BASE}/tournaments/${routeKey}/ta`);
    console.log(`TA phase 1: ${BASE}/tournaments/${routeKey}/ta/phase1`);
    console.log(`TA phase 2: ${BASE}/tournaments/${routeKey}/ta/phase2`);
    console.log(`TA finals: ${BASE}/tournaments/${routeKey}/ta/finals`);
  }

  console.log('');
  console.log(`Player nickname prefix: ${players[0]?.nickname?.replace(/_\d{2}$/, '') || 'n/a'}`);
}

async function cleanupPartial(page, tournamentId, players) {
  if (tournamentId) {
    console.log(`[cleanup] deleting tournament ${tournamentId}`);
    await apiDeleteTournament(page, tournamentId);
  }

  for (const player of players) {
    console.log(`[cleanup] deleting player ${player.nickname}`);
    await apiDeletePlayer(page, player.id);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const defaults = makeDefaults(options);
  const started = Date.now();
  let browser = null;
  let tournamentId = null;
  let players = [];

  try {
    console.log(`[finals-ready] target: ${BASE}`);
    console.log(`[finals-ready] profile: ${options.profileDir}`);
    console.log(`[finals-ready] modes: ${options.modes.join(', ')}`);

    browser = await chromium.launchPersistentContext(options.profileDir, {
      headless: options.headless,
      viewport: { width: 1280, height: 720 },
    });
    installApiLogging(browser, 'finals-ready');

    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

    await page.goto(BASE + '/', {
      waitUntil: 'domcontentloaded',
      timeout: envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000),
    });

    await ensureAdminSession(page, options.profileDir);

    console.log(`[create] tournament: ${defaults.name}`);
    tournamentId = await apiCreateTournament(page, defaults.name, { slug: defaults.slug });
    players = await createPlayers(page, defaults.nicknamePrefix);

    for (const mode of options.modes) {
      await prepareMode(page, tournamentId, mode, players, options);
    }

    printSummary({
      tournamentId,
      routeKey: defaults.slug || tournamentId,
      name: defaults.name,
      slug: defaults.slug,
      players,
      options,
    });

    console.log(`[finals-ready] finished in ${formatDuration(Date.now() - started)}`);
    return 0;
  } catch (error) {
    console.error('[finals-ready] failed:', error instanceof Error ? error.stack || error.message : error);
    if (!options.keepOnFail && browser) {
      try {
        const page = browser.pages()[0];
        if (page) {
          await cleanupPartial(page, tournamentId, players);
        }
      } catch (cleanupError) {
        console.error('[finals-ready] cleanup failed:', cleanupError instanceof Error ? cleanupError.stack || cleanupError.message : cleanupError);
      }
    }
    return 1;
  } finally {
    await closeBrowser(browser);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[finals-ready] fatal:', error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
