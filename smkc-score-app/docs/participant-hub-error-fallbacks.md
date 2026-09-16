# Participant hub error fallback contract

`/tournaments/[id]/participant` の tournament summary fetch でユーザーに表示する fallback error は、next-intl の `common.networkError` を使用する。

## 対象

- tournament summary API が non-2xx を返した場合
- `fetchWithRetry` が network / client-side exception を投げた場合

どちらも locale-aware な共通 fallback を表示し、日本語 locale で英語の固定文言へ戻らないようにする。

## 対象外

この契約は表示 fallback のみを扱う。以下は変更しない。

- API の response schema / status code
- `fetchWithRetry` の retry policy
- player/admin の authentication / authorization
- game mode routing
- DB、score calculation、Cloudflare、production migration

logger の診断文字列はユーザー向け表示とは別契約として維持する。
