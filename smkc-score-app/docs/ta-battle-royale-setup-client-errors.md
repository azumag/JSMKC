# TA battle royale setup client error contract

`BattleRoyaleSetupClient` のユーザー向け failure は next-intl の `common.networkError` に統一する。

開始 API の non-2xx response も `common.networkError` を表示し、response body は parse しない。backend の raw `payload.error` はユーザー UI にも client logger にも残さない。`fetch()` rejection やその他の client-side 例外、player list fetch failure も同じ generic message を表示し、browser/runtime 由来の raw `Error.message` もユーザー UI に表示しない。

## 診断情報

non-2xx start response は response body を parse しない。logger には operation、HTTP status、tournamentId のみを残す。request rejection は、HTTP response を受け取れていない transport/client failure の診断に必要なため、従来どおり元の例外を logger に残す。

この境界により、server-side implementation detail をブラウザ側へ複製せず、HTTP failure の診断に必要な最小 metadata だけを保持する。

## request lifetime

battle royale start POST は setup page の mount lifetime に所有させる。request ごとに `AbortController` を作り、page unmount 時は in-flight request を abort する。transport が abort を無視して late completion を返した場合も、現在所有している controller と一致する request だけが error state、saving state、成功後の finals navigation を更新できる。

abort は server-side mutation の取消し保証ではない。POST が server に到達済みなら mutation が適用されている可能性は残るため、client は「cancel succeeded」とは扱わず、stale completion の UI/navigation side effect だけを抑止する。

## ユーザー向け表示

1. start API の non-2xx response は `common.networkError`
2. fetch rejection は `common.networkError`
3. player list fetch failure も `common.networkError`

raw `payload.error` と raw `Error.message` は UI に出さない。non-2xx response の raw `payload.error` は client logger にも保存しない。

## 非対象

- POST payload / battle royale API contract
- 最低2人の開始制約
- 選手選択・TA handicap
- 確認ダイアログ
- 現在の setup page に所有された成功 request の finals への hard navigation
- server-side mutation の rollback/cancellation 保証
- DB / Cloudflare / production 設定
