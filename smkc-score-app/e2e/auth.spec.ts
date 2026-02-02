import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display signin page', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.locator('h1')).toContainText('ログイン');
    await expect(page.locator('form')).toBeVisible();
  });

  test('should display signin page with form elements', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.locator('input[name="nickname"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should navigate to tournaments after login', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[name="nickname"]', 'test_user');
    await page.fill('input[name="password"]', 'test_password');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('/tournaments', { timeout: 10000 });
    await expect(page).toHaveURL('/tournaments');
  });

  test('should show error message with invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.fill('input[name="nickname"]', 'invalid_user');
    await page.fill('input[name="password"]', 'wrong_password');
    await page.click('button[type="submit"]');

    await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 5000 });
  });

  test('TC-008: should redirect unauthenticated users from protected pages', async ({ page }) => {
    const protectedPages = ['/players', '/profile', '/tournaments'];

    for (const protectedPage of protectedPages) {
      await page.goto(protectedPage);

      await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10000 });

      const callbackUrl = new URL(page.url());
      expect(callbackUrl.searchParams.get('callbackUrl')).toBe(protectedPage);
    }
  });
});