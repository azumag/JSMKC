# プレイヤー編集時の画面応答停止問題の調査報告

## 問題概要

プレイヤー編集ダイアログで「Save Changes」ボタンを押すと、画面が応答しなくなる（フリーズする）現象。

## 調査日

2026年2月4日

## 影響範囲

- ファイル: `smkc-score-app/src/app/players/page.tsx`
- 関数: `handleUpdate` (lines 203-224)
- 影響ユーザー: 管理者のみ

## 根本原因

`handleUpdate` 関数に以下の実装上の問題があります：

### 1. loading state がリセットされない

```typescript
const handleUpdate = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setLoading(true);  // ← loading を true にセット

  try {
    const response = await fetch(`/api/players/${editingPlayerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || t('failedToUpdate'));
    }
    // ← 成功時の処理がない！
  } catch (err) {
    const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
    logger.error("Failed to update player:", metadata);
    setError(t('failedToUpdate'));
  }
  // ← どこでも setLoading(false) が呼ばれていない
};
```

**問題点:**
- `setLoading(true)` は実行されるが、`setLoading(false)` がコードのどこにも呼ばれていない
- `loading` state が `true` のままになり、ページ全体がローディングスケルトンに置き換えられる
- ローディングスケルトンはインタラクティブではないため、画面が応答しなくなる

### 2. 成功時の処理が欠落

`response.ok === true` の場合（更新成功時）の処理が全く実装されていません：

- ダイアログが閉じられない
- プレイヤーリストが更新されない (`fetchPlayers()` 未呼出)
- フォームがリセットされない
- 成功メッセージが表示されない

### 3. 比較: 正しく実装されている `handleSubmit`

「プレイヤー追加」機能の `handleSubmit` 関数（lines 160-196）は正しく実装されています：

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  // ← setLoading(false) は呼ばれていないが、追加機能では問題ない
  // （loading はページ全体の読み込みに使用され、追加時には影響しない）

  try {
    const response = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {  // ← 成功時の処理がある
      const data = await response.json();
      setFormData({ name: "", nickname: "", country: "" });
      setIsAddDialogOpen(false);  // ← ダイアログを閉じる
      
      if (data.temporaryPassword) {
        setTemporaryPassword(data.temporaryPassword);
        setIsPasswordDialogOpen(true);
      }
      
      fetchPlayers();  // ← リストを更新
    } else {
      const data = await response.json();
      setError(data.error || t('failedToCreate'));
    }
  } catch (err) {
    const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
    logger.error("Failed to create player:", metadata);
    setError(t('failedToCreate'));
  }
};
```

## API エンドポイントの確認

`PUT /api/players/:id` エンドポイント（`src/app/api/players/[id]/route.ts:85-193`）は正常に動作しています：

- 正常に200ステータスコードと更新されたプレイヤーオブジェクトを返す
- 管理者認証チェックが実装されている
- 入力バリデーションが実装されている
- Audit log が作成される
- エラーハンドリングが適切に実装されている

**結論:** 問題はサーバー側ではなく、クライアント側の実装にあります。

## 再現手順

1. 管理者としてログインする
2. `/players` ページにアクセスする
3. プレイヤーの「Edit」ボタンをクリックする
4. 編集ダイアログで何か変更を加える
5. 「Save Changes」ボタンをクリックする

**期待される動作:**
- API リクエストが送信される
- プレイヤーが更新される
- ダイアログが閉じる
- プレイヤーリストが更新される

**実際の動作:**
- API リクエストは成功する
- ダイアログが閉じない
- プレイヤーリストが更新されない
- loading state が true のまま残る
- 画面全体がローディングスケルトンに置き換わる
- ユーザー操作を受け付けなくなる

## 修正案

`handleUpdate` 関数を以下のように修正する必要があります：

```typescript
const handleUpdate = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    const response = await fetch(`/api/players/${editingPlayerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      // 成功時の処理を追加
      setIsEditDialogOpen(false);  // ダイアログを閉じる
      setEditingPlayerId(null);    // 編集中のプレイヤーIDをクリア
      setFormData({ name: "", nickname: "", country: "" });  // フォームをリセット
      fetchPlayers();              // プレイヤーリストを更新
    } else {
      const data = await response.json();
      setError(data.error || t('failedToUpdate'));
    }
  } catch (err) {
    const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
    logger.error("Failed to update player:", metadata);
    setError(t('failedToUpdate'));
  } finally {
    // 必ず loading を false に戻す
    setLoading(false);
  }
};
```

## 影響の分析

### ユーザー体験への影響

- **深刻度:** 高
- プレイヤー編集機能が完全に使用不能
- ページをリロードしない限り操作不能になる

### セキュリティへの影響

- なし

### データへの影響

- 更新処理自体はバックエンドで正常に完了する
- UI だけが更新されないため、ユーザーには失敗したように見える
- データの不整合は発生しない

## 今後の推奨事項

1. **即時修正:** `handleUpdate` 関数を上記の修正案で修正する
2. **回帰テスト:** 修正後、プレイヤー編集機能の完全なテストを実施
3. **コードレビュー強化:** 類似の問題がないか、他の mutation 操作（追加、削除）も確認
4. **ESLint ルール追加:** 非同期関数内で `setLoading(true)` が呼ばれる場合、必ず `setLoading(false)` が呼ばれることをチェックするカスタムルールを検討

## 添付ファイル

- 影響を受けるファイル: `smkc-score-app/src/app/players/page.tsx` (lines 203-224)
