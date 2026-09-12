# Prisma 7 readiness probe npm entrypoints

Issue #3114 の Prisma 7 migration evidence は、依存関係や生成物を変更しない read-only probe 群で収集します。ローカル確認や手動レビューでは、個別 script path を直接呼ぶ代わりに `smkc-score-app/package.json` の安定した npm entrypoint を利用できます。

全 evidence を標準順序でまとめて確認する場合は次を使います。

```bash
cd smkc-score-app
npm run prisma:v7:review
```

この aggregate command は primary readiness、D1 driver adapter wiring、TypeScript prerequisites、environment loading、removed surfaces、support-code surface、ESM surface の順に既存 probe を実行します。各 probe が migration blocker を報告すること自体は operational failure ではありません。probe の入力読取や実行そのものが失敗した場合は `&&` chain が停止し、その失敗を隠しません。

個別確認には次の entrypoint を利用できます。

```bash
npm run prisma:v7:readiness
npm run prisma:v7:readiness:json
npm run prisma:v7:driver-adapter
npm run prisma:v7:driver-adapter:json
npm run prisma:v7:typescript-prereqs
npm run prisma:v7:typescript-prereqs:json
npm run prisma:v7:env-loading
npm run prisma:v7:removed-surfaces
npm run prisma:v7:support-surface
npm run prisma:v7:esm-surface
```

各 entrypoint は既存の read-only probe をそのまま実行します。依存 version、`package-lock.json`、Prisma schema/config、generated client、D1、Cloudflare 設定、#3114 の一時 audit 例外を変更しません。

`:json` entrypoint は対応する probe と同じ evidence object を one-line JSON で返し、`GITHUB_STEP_SUMMARY` には Markdown を追記しません。現在は primary readiness、D1 driver adapter wiring、TypeScript prerequisites が machine-readable 出力に対応しています。その他の companion probe は現在の human-readable evidence contract を維持します。将来 script path や probe 構成を整理する場合も、npm entrypoint とその回帰テストを同時に更新し、手動 review の呼び出し口と実行順序を安定させます。

これらは Prisma 7 への自動 upgrade gate ではありません。major-version migration を実施する場合は `docs/prisma-v7-migration-readiness.md` の判断境界と検証項目に従い、依存 package set、schema/config、generated-client import、D1 driver adapter wiring、ESM 対応、Cloudflare/D1 検証を明示的な migration PR でまとめて評価します。
