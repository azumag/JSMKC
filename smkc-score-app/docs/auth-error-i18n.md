# Authentication error page i18n contract

Authentication error page は、通常のエラー表示だけでなく `useSearchParams()` を待つ Suspense fallback も利用者の locale に従う。

## Loading state

- Suspense fallback は既存の `common.loading` を使う。
- `Loading...` のような英語ハードコードを page source に置かない。
- `en.json` と `ja.json` の両方に `common.loading` が存在することを回帰テストで確認する。

## 非変更事項

NextAuth error code から `auth` namespace への mapping、contextual help、retry login、home navigation はこの変更では扱わず、既存挙動を維持する。
