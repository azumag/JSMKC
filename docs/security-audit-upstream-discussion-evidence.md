# Prisma upstream discussion evidence

Issue #3114 の手動監査では、`prisma/orm#30052` の open/closed 状態と merged fix PR `prisma/orm#30189` に加えて、tracking issue 上の**最新 discussion comment のメタデータ**も read-only evidence として取得します。

## 目的

`prisma/orm#30189` は v7 向けの修正ですが、JSMKC が現在利用している Prisma 6 系への backfill 可否は tracking issue の discussion で更新される可能性があります。issue の state だけではこの進展を見落としやすいため、`security-audit-upstream-issue.js` は issue snapshot が返す `comments` 件数を使い、その snapshot 時点の最後の comment を `per_page=1&page=<comment count>` で取得します。

この evidence は advisory-only です。最新 comment が存在しても、内容だけを根拠に dependency version、lockfile、temporary audit exception、`compatible_upstream_gate` の意味を変更しません。current compatible Prisma の published package evidence は引き続き `security-audit-upstream.js` が判断します。

## 取得する情報

comment body は取得結果に含まれていても保存・出力しません。監査証拠として保持するのは次のメタデータだけです。

- issue の comment count
- latest comment ID
- author login
- author association
- created / updated UTC timestamp
- canonical comment URL

GitHub Actions output では `comment_count`、`latest_comment_id`、`latest_comment_author`、`latest_comment_author_association`、`latest_comment_created_at`、`latest_comment_updated_at`、`latest_comment_url` として公開します。comment が0件なら latest-comment 系 output は `none` です。

## Job Summary

手動 `Security audit review` では `security-audit-upstream-issue.js` 自身が `GITHUB_STEP_SUMMARY` に discussion evidence を追記します。Actions step の生ログを開かなくても、次の項目を Job Summary から確認できます。

- `comment_count`
- `latest_comment_id`
- `latest_comment_author`
- `latest_comment_author_association`
- `latest_comment_created_at`
- `latest_comment_updated_at`
- `latest_comment_url`

Job Summary にも comment body は出力しません。表示値は normalize 済みの単一行メタデータだけに限定し、unsafe な値は summary へ書き込む前に拒否します。discussion section は明示的に advisory-only と表示し、既存の `compatible_upstream_gate` の入力・判定には接続しません。

## Fail-closed validation

latest comment evidence は tracking issue / fix PR と同じ request contract を使います。redirect は拒否し、同じ30秒の `AbortSignal` を共有します。さらに次を検証し、矛盾や取得失敗があれば probe 自体を非0終了させます。

- issue の `comments` が非負の safe integer であること
- comment API response がちょうど1件であること
- comment ID が正の safe integer であること
- `issue_url` が canonical `prisma/orm#30052` API URL と一致すること
- `html_url` が comment ID を含む canonical issue-comment URL と一致すること
- author login / author association が Actions の単一行 output として扱える形式であること
- created / updated timestamp が実在するUTC timestampで、`created_at <= updated_at` であること
- observation clock が issue / fix PR / latest comment の最新 `updated_at` より前でないこと

issue snapshot で `comments=0` の場合だけ comment request を省略し、`latestComment=null` とします。

## 安全境界

この probe は upstream discussion の「最新性」を観測するための補助証拠です。comment body を workflow output / Job Summary に流さないことで、任意の外部Markdownや改行を `$GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY` へ取り込む経路を作りません。また、v6 backfill の要望や示唆が comment に現れても、それを stable published remediation と同一視しません。#3114 の例外解除は、compatible stable package set、canonical audit、通常CI、Prisma/D1 parity、Cloudflare build を明示的な dependency update PR で確認した後に判断します。
