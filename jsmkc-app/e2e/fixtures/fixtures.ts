import { test as base, Page } from '@playwright/test';

type TestFixtures = {
  authenticatedPage: Page;
  testData: {
    tournamentId: string;
    userId: string;
  };
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/profile');
    await use(page);
  },
  testData: async ({}, use) => {
    await use({
      tournamentId: 'tournament-1',
      userId: 'user-1',
    });
  },
});

export const expect = test.expect;