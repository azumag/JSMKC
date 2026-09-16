# Tournament detail fetch error contract

`/tournaments/[id]/*` の共通 layout は tournament summary (`GET /api/tournaments/:id?fields=summary`) の取得失敗を、存在しない大会と通信/API 障害で区別する。

## 表示契約

- HTTP 404: `common.tournamentNotFound`
- 404 以外の non-2xx: `common.networkError`
- fetch / network rejection: `common.networkError`

共通 layout が持つ外側の retry（2秒間隔、最大2回追加試行）は維持する。最初の失敗や retry 中には最終エラーを表示せず、既存の loading skeleton を維持する。3回目の試行まで失敗した場合にだけ上記の最終エラーを表示する。

一時的な失敗の後に retry が成功した場合は failure state を破棄し、通常の tournament header / lifecycle controls / mode navigation を表示する。

## 診断

ユーザー向けには翻訳済みの共有メッセージだけを表示する。non-2xx の status と fetch rejection の例外情報は client logger に残し、raw runtime detail は UI に露出しない。

## 非対象

- retry 回数・間隔
- tournament summary API の response schema
- participant hub の fetch contract
- status lifecycle mutation
- public mode / navigation policy
