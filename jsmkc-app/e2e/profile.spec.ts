import { test, expect } from '@playwright/test';

test.describe('Profile', () => {
  test('should display user information', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('h1:has-text("Profile"), h1:has-text("プロフィール")').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display user details', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('text=Name:, Email:, Role:').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display player association section', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('text=Player Association, プレイヤー関連付け').first()).toBeVisible({ timeout: 10000 });
  });
});