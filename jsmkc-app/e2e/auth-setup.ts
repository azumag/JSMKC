import { Page } from '@playwright/test';

export async function authenticateTestUser(page: Page) {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/profile');
}

export async function clearAuthSession(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
}