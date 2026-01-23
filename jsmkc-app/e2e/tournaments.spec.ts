import { test, expect } from '@playwright/test';

test.describe('Tournaments', () => {
  test('should display tournaments list page', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1:has-text("Tournaments"), h1:has-text("トーナメント")').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display create tournament button for admin', async ({ page }) => {
    await page.goto('/tournaments');
    const createButton = page.locator('button:has-text("Create Tournament"), button:has-text("作成")').first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
  });

  test('should display tournament table structure', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('text=Name').or(page.locator('text=Date'))).toBeVisible({ timeout: 10000 });
  });
});