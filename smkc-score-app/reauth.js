const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launchPersistentContext(
    '/tmp/playwright-smkc-profile',
    { headless: false, viewport: { width: 1280, height: 720 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  
  try {
    await page.goto('https://smkc.bluemoon.works/auth/signin');
    await page.waitForTimeout(2000);
    
    // Click the Admin tab first
    const adminTab = page.locator('[role="tab"]').filter({ hasText: /管理者|Admin/ });
    if (await adminTab.count() > 0) {
      await adminTab.click();
      await page.waitForTimeout(1000);
    }
    
    // Click the Discord login button
    const discordBtn = page.locator('button').filter({ hasText: /Discordでログイン|Sign in with Discord/i });
    if (await discordBtn.count() > 0) {
      await discordBtn.click();
      console.log('Discord login button clicked. Please complete authentication.');
      console.log('The browser will stay open. Press Ctrl+C in this terminal when done.');
    } else {
      console.log('Discord button not found. You may already be logged in or the page is different.');
    }
    
    // Poll session status every 5 seconds for up to 5 minutes
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      try {
        const checkPage = await browser.newPage();
        await checkPage.goto('https://smkc.bluemoon.works/api/auth/session', { waitUntil: 'domcontentloaded' });
        await checkPage.waitForTimeout(500);
        const sessionText = await checkPage.locator('body pre').innerText().catch(() => '');
        await checkPage.close();
        
        if (sessionText && sessionText !== 'null' && sessionText.includes('user')) {
          console.log('Session detected! You are authenticated.');
          console.log('Session snippet:', sessionText.substring(0, 100));
          break;
        }
      } catch (e) {
        // ignore polling errors
      }
    }
    
    // Keep browser open so user can continue
    console.log('Browser will remain open. Close it manually when ready.');
    await new Promise(() => {}); // keep alive indefinitely
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
