# QR login i18n contract

QR one-scan login の待機・エラー表示は、利用者の locale に従って既存の `auth` namespace を使う。

## Loading state

- `QrLoginContent` の通常の pending state は `auth.qrLoginInProgress` を表示する。
- `useSearchParams()` を待つ Suspense fallback も同じ `auth.qrLoginInProgress` を再利用する。
- Suspense fallback に英語ハードコードを置かない。
- `en.json` と `ja.json` の両方に `auth.qrLoginInProgress` が存在することを回帰テストで確認する。

## 非変更事項

QR token の読み取り、URL history からの token 除去、`player-qr-login` への `signIn()`、成功時の `/tournaments` redirect、無効 token / missing token の error state はこの契約の対象外で、変更しない。
