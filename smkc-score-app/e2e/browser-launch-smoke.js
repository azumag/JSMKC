const { launchPersistentChromiumContext, resolveE2EProfileDir } = require('./lib/common');

async function main() {
  const browser = await launchPersistentChromiumContext(resolveE2EProfileDir(), {
    headless: process.env.E2E_HEADLESS !== '0',
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto('about:blank');
    console.log('[browser-launch-smoke] launch-ok');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[browser-launch-smoke] launch failed:', error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}

module.exports = { main };
