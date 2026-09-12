# Prisma 7 readiness probe npm entrypoints

Issue #3114 の Prisma 7 migration evidence は、依存関係や生成物を変更しない read-only probe 群で収集します。ローカル確認や手動レビューでは、個別 script path を直接呼ぶ代わりに `smkc-score-app/package.json` の安定した npm entrypoint を利用できます。

```bash
cd smkc-score-app
npm run prisma:v7:readiness
npm run prisma:v7:readiness:json
npm run prisma:v7:typescript-prereqs
npm run prisma:v7:env-loading
npm run prisma:v7:removed-surfaces
npm run prisma:v7:support-surface
npm run prisma:v7:esm-surface
```

各 entrypoint は既存の read-only probe をそのまま実行します。依存 version、`package-lock.json`、Prisma schema/config、generated client、D1、Cloudflare 設定、#3114 の一時 audit 例外を変更しません。

`prisma:v7:readiness:json` は primary readiness probe の machine-readable 出力です。その他の companion probe は現在の human-readable evidence contract を維持します。将来 script path を整理する場合も、npm entrypoint とその回帰テストを同時に更新し、手動 review の呼び出し口を安定させます。

これらは Prisma 7 への自動 upgrade gate ではありません。major-version migration を実施する場合は `docs/prisma-v7-migration-readiness.md` の判断境界と検証項目に従い、依存 package set、schema/config、generated-client import、ESM 対応、Cloudflare/D1 検証を明示的な migration PR でまとめて評価します。
