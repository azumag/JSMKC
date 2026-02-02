import { test, expect } from '@playwright/test';

test.describe('Basic Smoke Tests', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible({ timeout: 30000 });
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto('/');
    
    const playersLink = page.locator('a[href="/players"]').first();
    const tournamentsLink = page.locator('a[href="/tournaments"]').first();
    
    await expect(playersLink).toBeVisible({ timeout: 10000 });
    await expect(tournamentsLink).toBeVisible({ timeout: 10000 });
  });
});