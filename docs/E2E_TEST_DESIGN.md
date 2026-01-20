# E2Eテスト実装 - 設計ドキュメント

## 1. High-Level System Design

### 1.1 テストフレームワーク選定
**選定フレームワーク: Playwright**

**選定理由:**
- Next.js 16 + React 19との高い互換性
- 複数ブラウザ対応 (Chromium, Firefox, WebKit)
- TypeScriptの完全サポート
- 高速並列テスト実行
- モダンなAPIと自動待機機能
- ビジュアルリグレッションテスト機能
- ネットワークモック/スタブ機能
- 画面撮影・動画録画機能（デバッグ用）

### 1.2 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                  E2E Test Suite                      │
├─────────────────────────────────────────────────────┤
│  Test Files (Playwright Tests)                       │
│  ├── auth.spec.ts          (認証テスト)               │
│  ├── players.spec.ts       (プレイヤー管理)          │
│  ├── profile.spec.ts       (プロフィール)            │
│  ├── tournaments.spec.ts   (トーナメント一覧/詳細)   │
│  └── game-modes.spec.ts    (ゲームモード予選)        │
├─────────────────────────────────────────────────────┤
│  Test Utilities & Helpers                           │
│  ├── auth-setup.ts         (認証セットアップ)         │
│  ├── test-helpers.ts       (汎用ヘルパー)             │
│  └── fixtures.ts           (テストフィクスチャ)       │
├─────────────────────────────────────────────────────┤
│  Test Configuration                                 │
│  ├── playwright.config.ts  (Playwright設定)          │
│  └── .env.test            (テスト環境変数)           │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│           Next.js Application (Development)          │
├─────────────────────────────────────────────────────┤
│  Pages & API Routes                                  │
│  - /auth/signin, /auth/error                         │
│  - /players, /profile                                │
│  - /tournaments, /tournaments/[id]                   │
│  - /tournaments/[id]/{ta,bm,mr,gp}/*                │
│  - API Routes (tournament management)                │
├─────────────────────────────────────────────────────┤
│  Authentication (NextAuth v5)                       │
│  - Session Management                                │
│  - Token Validation                                  │
├─────────────────────────────────────────────────────┤
│  Database (Prisma + Test Database)                   │
│  - Test Data Seeding                                 │
│  - Cleanup Scripts                                   │
└─────────────────────────────────────────────────────┘
```

## 2. 詳細技術仕様

### 2.1 設定・セットアップ

#### 2.1.1 Playwrightインストール
```bash
npm install -D @playwright/test
npx playwright install
```

#### 2.1.2 playwright.config.ts 設定
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
    ['junit', { outputFile: 'test-results/e2e-results.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### 2.1.3 .env.test 設定
```env
DATABASE_URL="postgresql://test_user:test_password@localhost:5432/jsmkc_test"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="test-secret-key-for-e2e-testing"
```

### 2.2 テスト構成

#### 2.2.1 テストファイル構成
```
e2e/
├── auth.spec.ts              # 認証関連テスト
├── players.spec.ts           # プレイヤー管理テスト
├── profile.spec.ts           # プロフィールテスト
├── tournaments.spec.ts       # トーナメント一覧・詳細テスト
├── game-modes.spec.ts        # ゲームモード予選テスト
├── auth-setup.ts             # 認証セットアップヘルパー
├── test-helpers.ts           # 汎用テストヘルパー
└── fixtures/
    ├── auth-fixtures.ts      # 認証フィクスチャ
    └── tournament-fixtures.ts # トーナメントフィクスチャ
```

### 2.3 テスト実装仕様

#### 2.3.1 認証テスト (auth.spec.ts)
```typescript
describe('Authentication', () => {
  test('should display signin page', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page).toHaveTitle('Sign In');
    await expect(page.locator('form')).toBeVisible();
  });

  test('should display error page', async ({ page }) => {
    await page.goto('/auth/error?error=Configuration');
    await expect(page.locator('text=error')).toBeVisible();
  });

  test('should authenticate with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/profile');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=error')).toBeVisible();
  });
});
```

#### 2.3.2 プレイヤー管理テスト (players.spec.ts)
```typescript
describe('Players Management', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
  });

  test('should display players list', async ({ page }) => {
    await page.goto('/players');
    await expect(page.locator('h1')).toContainText('Players');
    await expect(page.locator('[data-testid="player-item"]')).toHaveCount(10);
  });

  test('should search players by name', async ({ page }) => {
    await page.goto('/players');
    await page.fill('[data-testid="search-input"]', 'John');
    await page.click('[data-testid="search-button"]');
    await expect(page.locator('[data-testid="player-item"]')).toHaveCount(2);
  });

  test('should navigate to player detail', async ({ page }) => {
    await page.goto('/players');
    await page.click('[data-testid="player-item"]:first-child');
    await expect(page).toHaveURL(/\/players\/.+/);
  });
});
```

#### 2.3.3 プロフィールテスト (profile.spec.ts)
```typescript
describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
  });

  test('should display user profile', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('h1')).toContainText('Profile');
    await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-email"]')).toBeVisible();
  });

  test('should update profile information', async ({ page }) => {
    await page.goto('/profile');
    await page.click('[data-testid="edit-button"]');
    await page.fill('[data-testid="name-input"]', 'Updated Name');
    await page.click('[data-testid="save-button"]');
    await expect(page.locator('[data-testid="user-name"]')).toHaveText('Updated Name');
  });
});
```

#### 2.3.4 トーナメント一覧・詳細テスト (tournaments.spec.ts)
```typescript
describe('Tournaments', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
  });

  test('should display tournaments list', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page.locator('h1')).toContainText('Tournaments');
    await expect(page.locator('[data-testid="tournament-card"]')).toHaveCount(5);
  });

  test('should navigate to tournament detail', async ({ page }) => {
    await page.goto('/tournaments');
    await page.click('[data-testid="tournament-card"]:first-child');
    await expect(page).toHaveURL(/\/tournaments\/.+/);
    await expect(page.locator('h1')).toContainText('Tournament');
  });

  test('should display tournament stages', async ({ page }) => {
    await page.goto('/tournaments/tournament-1');
    await expect(page.locator('[data-testid="stage-tab"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="ta-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="bm-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="mr-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="gp-tab"]')).toBeVisible();
  });
});
```

#### 2.3.5 ゲームモード予選テスト (game-modes.spec.ts)
```typescript
describe('Game Modes', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
  });

  describe('Time Attack (TA)', () => {
    test('should display TA qualification stage', async ({ page }) => {
      await page.goto('/tournaments/tournament-1/ta');
      await expect(page.locator('h1')).toContainText('Time Attack');
      await expect(page.locator('[data-testid="qualification-table"]')).toBeVisible();
    });

    test('should display participant score input', async ({ page }) => {
      await page.goto('/tournaments/tournament-1/ta/participant');
      await expect(page.locator('[data-testid="score-input-form"]')).toBeVisible();
      await page.fill('[data-testid="mc1-input"]', '1:23.456');
      await page.click('[data-testid="save-button"]');
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });
  });

  describe('Battle Mode (BM)', () => {
    test('should display BM qualification stage', async ({ page }) => {
      await page.goto('/tournaments/tournament-1/bm');
      await expect(page.locator('h1')).toContainText('Battle Mode');
      await expect(page.locator('[data-testid="qualification-bracket"]')).toBeVisible();
    });
  });

  describe('Match Race (MR)', () => {
    test('should display MR qualification stage', async ({ page }) => {
      await page.goto('/tournaments/tournament-1/mr');
      await expect(page.locator('h1')).toContainText('Match Race');
      await expect(page.locator('[data-testid="qualification-bracket"]')).toBeVisible();
    });
  });

  describe('Grand Prix (GP)', () => {
    test('should display GP qualification stage', async ({ page }) => {
      await page.goto('/tournaments/tournament-1/gp');
      await expect(page.locator('h1')).toContainText('Grand Prix');
      await expect(page.locator('[data-testid="qualification-bracket"]')).toBeVisible();
    });
  });
});
```

### 2.4 認証セットアップヘルパー (auth-setup.ts)
```typescript
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
```

### 2.5 テストフィクスチャ (fixtures.ts)
```typescript
import { test as base } from '@playwright/test';

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
```

## 3. 実装手順

### Phase 1: 環境セットアップ
1. Playwrightのインストールと設定
2. playwright.config.tsの作成
3. .env.testの設定
4. テストデータベースのセットアップ

### Phase 2: 基礎テスト実装
1. 認証ヘルパーの作成
2. 基本的なページ遷移テスト
3. UI要素の可視性テスト

### Phase 3: 機能テスト実装
1. 認証フローのテスト
2. プレイヤー管理機能のテスト
3. プロフィール機能のテスト
4. トーナメント一覧・詳細のテスト

### Phase 4: ゲームモードテスト実装
1. タイムアタック予選のテスト
2. バトルモード予選のテスト
3. マッチレース予選のテスト
4. グランプリ予選のテスト

### Phase 5: CI/CD統合
1. GitHub Actionsの設定
2. テストレポートの設定
3. エラー通知の設定

## 4. テストカバレッジ目標

### 4.1 ページカバレッジ
- `/auth/signin` - 100%
- `/auth/error` - 100%
- `/players` - 90%
- `/profile` - 90%
- `/tournaments` - 90%
- `/tournaments/[id]` - 90%
- `/tournaments/[id]/ta/*` - 85%
- `/tournaments/[id]/bm/*` - 85%
- `/tournaments/[id]/mr/*` - 85%
- `/tournaments/[id]/gp/*` - 85%

### 4.2 機能カバレッジ
- 認証フロー - 100%
- プレイヤー検索・閲覧 - 90%
- プロフィール編集 - 90%
- トーナメント閲覧 - 90%
- スコア入力 - 85%
- ブラケット表示 - 85%

## 5. 品質基準

### 5.1 テスト品質
- すべてのテストが独立して実行可能
- テスト間のデータ依存を排除
- 適切な待機処理（自動待機の活用）
- 明確なアサーションメッセージ
- 再現性の確保

### 5.2 パフォーマンス
- テスト実行時間 < 5分
- 並列実行による高速化
- テストデータの効率的な管理

### 5.3 メンテナンス性
- 明確な命名規則
- 共通ヘルパーの活用
- ドキュメントの整備
- エラーハンドリングの実装

## 6. リスクと対応策

### 6.1 認証関連
- **リスク:** 認証セッションの管理が複雑
- **対応策:** 認証ヘルパーの標準化、フィクスチャの活用

### 6.2 テストデータ
- **リスク:** テストデータの競合
- **対応策:** テストデータベースの分離、クリーンアップ処理

### 6.3 実行時間
- **リスク:** E2Eテストの実行時間が長くなる
- **対応策:** 並列実行、スマートなテスト設計

### 6.4 ブラウザ互換性
- **リスク:** 各ブラウザでの挙動の差異
- **対応策:** 複数ブラウザでのテスト実行

## 7. 次のステップ

1. **Phase 1 実施:** Playwright環境セットアップ
2. **Phase 2 実施:** 基礎テストの実装
3. **Phase 3-4 実施:** 機能テストの実装
4. **Phase 5 実施:** CI/CD統合
5. **テストカバレッジ確認:** 目標達成状況の確認
6. **最終レビュー:** テスト品質の総合評価