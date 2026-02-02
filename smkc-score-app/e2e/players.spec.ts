import { test, expect } from '@playwright/test';

test.describe('Players Management', () => {
  test('should display players page', async ({ page }) => {
    await page.goto('/players');
    await expect(page.locator('h1:has-text("Players"), h1:has-text("プレイヤー")').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display table structure when no players', async ({ page }) => {
    await page.goto('/players');
    await expect(page.locator('text=No players, Add your first player').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display add player button for admin', async ({ page }) => {
    await page.goto('/players');
    const addButton = page.locator('button:has-text("Add Player"), button:has-text("追加")').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });
});