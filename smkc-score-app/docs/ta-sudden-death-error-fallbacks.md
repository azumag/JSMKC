# TA sudden-death mutation error fallback contract

共有 `useTaSuddenDeath` hook が扱う course change と sudden-death result submit の client fallback は、next-intl の `common.networkError` を使用する。

API が具体的な `error` を返した場合はその内容を優先し、response body に error がない場合や非 `Error` 例外の場合だけ locale-aware な共通 fallback を表示する。

## 対象

- `change_sudden_death_course` の client-side fallback
- `submit_sudden_death` の client-side fallback
- finals / elimination の両画面から共有される hook の表示契約

## 対象外

この変更は user-visible fallback のみを扱う。以下は変更しない。

- API error schema / status code
- sudden-death rule / scoring / course selection logic
- request payload
- retry policy
- DB、Cloudflare、production migration
