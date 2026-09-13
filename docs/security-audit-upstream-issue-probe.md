# Prisma upstream issue probe

Issue #3114 の暫定 `deepmerge-ts` audit 例外は、Prisma upstream の tracking issue `prisma/orm#30052`、その既知の修正PR `prisma/orm#30189`、npm registry 上の forward remediation evidence を分けて確認して判断します。

upstream evidence を read-only で再確認するには、`smkc-score-app` で次を実行します。

```bash
npm run security:audit:upstream-issue
```

機械可読な evidence が必要な場合は JSON entrypoint を使用します。

```bash
npm run security:audit:upstream-issue:json
```

probe は GitHub REST API から issue #30052 を取得し、issue number、`open` / `closed` state、state reason、最終更新日時、close日時、canonical issue URL を採用します。さらに、取得を実際に行った時刻を `checkedAt`（GitHub Actions output では `checked_at`）として別に記録します。`updatedAt` は upstream issue 自体が最後に変更された時刻であり、今回いつ確認したかを示す evidence ではないため、この2つを混同しません。

同じ probe で `prisma/orm#30189` も取得し、既知の修正が **`v7` branch に merge 済み**であることを独立した historical evidence として検証します。PR number、closed/merged state、base ref、merge commit SHA、merge/updated timestamp、canonical PR URL を確認し、merge commit は `93118fdeba185110fb7b0bd5e945461405baf65a` に固定します。これにより「upstream branch 上では修正済み」という事実と、「JSMKC が現在使う Prisma 6 系で installable な stable forward remediation があるか」という判断を混同しません。

GitHub Actions output では修正PR evidence を `fix_pr_number`、`fix_pr_state`、`fix_pr_merged`、`fix_pr_base_ref`、`fix_pr_merge_commit_sha`、`fix_pr_merged_at`、`fix_pr_updated_at`、`fix_pr_url` として公開します。JSON output では `fixPullRequest` に同じ情報をまとめます。

GitHub REST API request には1つの30秒 timeout signal を tracking issue と修正PRの両方で共有し、外部API応答待ちで review command が無期限に停止しないようにします。また endpoint は固定されているため redirect は追従せず、redirect response は evidence 未取得として拒否します。timeout・redirect・network error・HTTP error はいずれも fail-closed で扱います。

`stateReason` は GitHub API の `state_reason` を保持します。open issue では `null` または `reopened`、closed issue では `null` / `completed` / `not_planned` / `duplicate` のみを受理します。`closedAt` は open issue では `null`、closed issue では有効な UTC timestamp を必須とします。GitHub Actions output では null 値を空文字にはせず、`state_reason=none` / `closed_at=none` として明示します。これにより「修正完了としてcloseされた」のか「not planned / duplicate としてcloseされた」のかを後続の監査から区別できます。

GitHub timestamp は `YYYY-MM-DDTHH:mm:ssZ` という文字列形式だけでなく、実在するUTC日時かどうかまで検証します。たとえば `2026-02-31T12:00:00Z` のように形式だけ整った不可能な日時は拒否します。closed issue では `closedAt <= updatedAt`、修正PRでは `mergedAt <= updatedAt` を必須とし、metadata の時系列が逆転した response は evidence として採用しません。また観測時刻 `checkedAt` が issue または修正PRの最新 `updatedAt` より過去になる場合も、runner clock skew 等で「更新前に観測した」矛盾した evidence になるため fail-closed にします。

API response が失敗する、JSON として読めない、issue number・state・state reason・timestamp・URL が期待する tracking issue と一致しない、修正PRの number・merged state・base ref・merge commit・timestamp・URL が既知の #30189 と一致しない、state と closure metadata の組み合わせや時系列が矛盾する、または確認時刻を安全な UTC timestamp として生成できない場合は fail-closed で終了します。

`GITHUB_TOKEN` が存在する場合は API rate limit を安定させるため bearer token として使用します。存在しない場合も public issue / PR の read-only 取得として実行できます。token 自体は出力・保存しません。redirect を追従しないことで、この認証 header を想定外の遷移先へ持ち出す経路も作りません。

この probe は **advisory evidence** です。#30189 が `v7` に merge 済みであることや upstream issue が `closed` になったことだけを根拠に #3114 の例外を自動削除しません。実際の完了判断では引き続き `security:audit:upstream` / `security:audit:next-major` で published package set を確認し、現在の Prisma 6 系で安全な forward releaseが利用可能になるか、明示的な Prisma 7 migration PR で `deepmerge-ts >=8.0.0` を含む package set と関連テスト、Prisma/D1 parity、Cloudflare build が成立することを確認します。
