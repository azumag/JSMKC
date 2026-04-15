/**
 * E2E BM focused tests.
 *
 * Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 * Admin session must already exist in the profile (Discord OAuth).
 *
 * Run: npm run e2e:bm  (from smkc-score-app/)
 */
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const WAIT = 8000;
const results = [];

function log(tc, s, d = '') {
  console.log(`${s === 'PASS' ? '✅' : s === 'SKIP' ? '⏭️' : '❌'} [${tc}] ${s}${d ? ' — ' + d : ''}`);
  results.push({ tc, s, d });
}

async function nav(page, path) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(WAIT);
      return;
    } catch (err) {
      lastError = err;
      if (attempt === 2) throw err;
      await page.waitForTimeout(3000);
    }
  }
  throw lastError;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runTc322(adminPage) {
  // TC-322: BM participant can correct a submitted score.
  // Creates a draft temp tournament (so cleanup remains allowed), submits a BM score
  // as a player, then uses the completed-match correction UI to change 3-1 -> 2-2.
  let tournamentId = null;
  let player1Id = null;
  let player2Id = null;
  let playerBrowser = null;

  try {
    const stamp = Date.now();
    const player1Nick = `e2e_bmc1_${stamp}`;
    const player2Nick = `e2e_bmc2_${stamp}`;

    const p1 = await adminPage.evaluate(async (d) => {
      const r = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, { name: 'E2E BM Correct P1', nickname: player1Nick, country: 'JP' });
    player1Id = p1.b?.data?.player?.id ?? null;
    const playerPassword = p1.b?.data?.temporaryPassword ?? null;

    const p2 = await adminPage.evaluate(async (d) => {
      const r = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, { name: 'E2E BM Correct P2', nickname: player2Nick, country: 'JP' });
    player2Id = p2.b?.data?.player?.id ?? null;

    if (p1.s !== 201 || p2.s !== 201 || !player1Id || !player2Id || !playerPassword) {
      throw new Error('Failed to create BM correction players');
    }

    const tournament = await adminPage.evaluate(async (d) => {
      const r = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, {
      name: `E2E BM Correction ${stamp}`,
      date: new Date().toISOString(),
      dualReportEnabled: false,
    });
    tournamentId = tournament.b?.data?.id ?? null;
    if (tournament.s !== 201 || !tournamentId) {
      throw new Error('Failed to create BM correction tournament');
    }

    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/bm`,
      {
        players: [
          { playerId: player1Id, group: 'A' },
          { playerId: player2Id, group: 'A' },
        ],
      },
    ]);
    if (setup.s !== 201) throw new Error(`BM setup failed (${setup.s})`);

    const initialBm = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      return j.data || j;
    }, `/api/tournaments/${tournamentId}/bm`);
    const match = (initialBm.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE BM match found');

    const p1Label = match.player1.nickname;
    const p2Label = match.player2.nickname;

    playerBrowser = await chromium.launch({ headless: false });
    const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
    const playerPage = await playerContext.newPage();

    await nav(playerPage, '/auth/signin');
    await playerPage.locator('#nickname').fill(player1Nick);
    await playerPage.locator('#password').fill(playerPassword);
    await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
    await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
    await playerPage.waitForTimeout(1000);

    await nav(playerPage, `/tournaments/${tournamentId}/bm/participant`);

    for (let i = 0; i < 3; i++) {
      await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} \\+1`) }).click();
    }
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();

    playerPage.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await playerPage.getByRole('button', { name: /スコア送信|Submit Scores/ }).click();
    await playerPage.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('スコアを修正') || text.includes('Correct Score');
    }, null, { timeout: 15000 });

    await playerPage.getByRole('button', { name: /スコアを修正|Correct Score/ }).click();
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} -1`) }).click();
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();

    playerPage.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await playerPage.getByRole('button', { name: /修正を送信|Submit Correction/ }).click();
    await playerPage.waitForTimeout(3000);

    const correctedBm = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      return j.data || j;
    }, `/api/tournaments/${tournamentId}/bm`);
    const correctedMatch = (correctedBm.matches || []).find((m) => m.id === match.id);
    const correctionPersisted =
      correctedMatch?.completed === true &&
      correctedMatch.score1 === 2 &&
      correctedMatch.score2 === 2;

    log('TC-322', correctionPersisted ? 'PASS' : 'FAIL',
      correctionPersisted ? ''
      : !correctedMatch ? 'Corrected match not found'
      : `completed=${correctedMatch.completed} score=${correctedMatch.score1}-${correctedMatch.score2}`);
  } catch (err) {
    log('TC-322', 'FAIL', err instanceof Error ? err.message : 'BM correction flow failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
    if (tournamentId) {
      await adminPage.evaluate(async (url) => { await fetch(url, { method: 'DELETE' }); },
        `/api/tournaments/${tournamentId}`).catch(() => {});
    }
    if (player1Id) {
      await adminPage.evaluate(async (url) => { await fetch(url, { method: 'DELETE' }); },
        `/api/players/${player1Id}`).catch(() => {});
    }
    if (player2Id) {
      await adminPage.evaluate(async (url) => { await fetch(url, { method: 'DELETE' }); },
        `/api/players/${player2Id}`).catch(() => {});
    }
  }
}

(async () => {
  const browser = await chromium.launchPersistentContext(
    '/tmp/playwright-smkc-profile',
    { headless: false, viewport: { width: 1280, height: 720 } }
  );
  const page = browser.pages()[0] || await browser.newPage();

  await nav(page, '/');
  await runTc322(page);

  console.log('\n========== SUMMARY ==========');
  const p = results.filter((r) => r.s === 'PASS').length;
  const f = results.filter((r) => r.s === 'FAIL').length;
  const sk = results.filter((r) => r.s === 'SKIP').length;
  console.log(`PASS: ${p} | FAIL: ${f} | SKIP: ${sk} | Total: ${results.length}`);
  if (f > 0) results.filter((r) => r.s === 'FAIL').forEach((r) => console.log(`  ❌ [${r.tc}] ${r.d}`));

  await browser.close();
  process.exit(f > 0 ? 1 : 0);
})();
