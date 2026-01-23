import { test, expect } from '@playwright/test';

test.describe('Game Modes', () => {
  test('should display home page game modes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Time Trial').or(page.locator('text=タイムアタック'))).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Battle Mode').or(page.locator('text=バトルモード'))).toBeVisible();
    await expect(page.locator('text=Match Race').or(page.locator('text=マッチレース'))).toBeVisible();
    await expect(page.locator('text=Grand Prix').or(page.locator('text=グランプリ'))).toBeVisible();
  });
});