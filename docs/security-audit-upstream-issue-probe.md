# Prisma upstream issue probe

Issue #3114 の暫定 `deepmerge-ts` audit 例外は、Prisma upstream の tracking issue `prisma/orm#30052` と npm registry 上の forward remediation evidence の両方を確認して判断します。

upstream issue の状態を read-only で再確認するには、`smkc-score-app` で次を実行します。

```bash
npm run security:audit:upstream-issue
```

機械可読な evidence が必要な場合は JSON entrypoint を使用します。

```bash
npm run security:audit:upstream-issue:json
```

probe は GitHub REST API から issue #30052 を取得し、issue number、`open` / `closed` state、state reason、最終更新日時、close日時、canonical issue URL を採用します。さらに、取得を実際に行った時刻を `checkedAt`（GitHub Actions output では `checked_at`）として別に記録します。`updatedAt` は upstream issue 自体が最後に変更された時刻であり、今回いつ確認したかを示す evidence ではないため、この2つを混同しません。

`stateReason` は GitHub API の `state_reason` を保持します。open issue では `null` または `reopened`、closed issue では `null` / `completed` / `not_planned` のみを受理します。`closedAt` は open issue では `null`、closed issue では有効な UTC timestamp を必須とします。GitHub Actions output では null 値を空文字にはせず、`state_reason=none` / `closed_at=none` として明示します。これにより「修正完了としてcloseされた」のか「not plannedとしてcloseされた」のかを後続の監査から区別できます。

API response が失敗する、JSON として読めない、issue number・state・state reason・timestamp・URL が期待する tracking issue と一致しない、state と closure metadata の組み合わせが矛盾する、または確認時刻を安全な UTC timestamp として生成できない場合は fail-closed で終了します。

`GITHUB_TOKEN` が存在する場合は API rate limit を安定させるため bearer token として使用します。存在しない場合も public issue の read-only 取得として実行できます。token 自体は出力・保存しません。

この probe は **advisory evidence** です。upstream issue が `closed` になった場合も、`stateReason` が `completed` であることだけを根拠に #3114 の例外を自動削除しません。`not_planned` や理由なしの close も明示的に観測しつつ、実際の完了判断では引き続き `security:audit:upstream` / `security:audit:next-major` で published package set を確認し、`deepmerge-ts >=8.0.0` を含む安全な forward release、関連テスト、Prisma/D1 parity、Cloudflare build が成立することを確認します。
