# Prisma 7 readiness probe npm entrypoints

Issue #3114 の Prisma 7 migration evidence は、依存関係や生成物を変更しない read-only probe 群で収集します。ローカル確認や手動レビューでは、個別 script path を直接呼ぶ代わりに `smkc-score-app/package.json` の安定した npm entrypoint を利用できます。

全 evidence を標準順序でまとめて確認する場合は次を使います。

```bash
cd smkc-score-app
npm run prisma:v7:review
```

この aggregate command は primary readiness、D1 driver adapter wiring、TypeScript prerequisites、environment loading、removed surfaces、support-code surface、ESM surface の順に既存 probe を実行します。各 probe が migration blocker を報告すること自体は operational failure ではありません。probe の入力読取や実行そのものが失敗した場合は `&&` chain が停止し、その失敗を隠しません。

7種類の evidence を1つの machine-readable JSON object として取得する場合は次を使います。

```bash
npm run prisma:v7:review:json
```

`prisma:v7:review:json` は各 probe を既存の `--json` mode で同じ標準順序に実行し、`schemaVersion`、`probeCount`、`probes` を持つ one-line JSON を返します。`probes` の key は `readiness`、`driverAdapter`、`typescriptPrerequisites`、`environmentLoading`、`removedSurfaces`、`supportSurface`、`esmSurface` です。aggregate layer は各 probe の `ready` 等を再解釈せず、その evidence object をそのまま保持します。

いずれかの probe が実行不能、非0終了、空出力、invalid JSON、JSON object 以外を返した場合、aggregate command は partial evidence を出力せず非0終了します。これにより自動処理が欠落した evidence を完全な review 結果として扱うことを防ぎます。aggregate JSON 自体にも時刻等の非決定的フィールドは追加しないため、同じ repository state の比較にも利用できます。

個別確認には次の entrypoint を利用できます。

```bash
npm run prisma:v7:readiness
npm run prisma:v7:readiness:json
npm run prisma:v7:driver-adapter
npm run prisma:v7:driver-adapter:json
npm run prisma:v7:typescript-prereqs
npm run prisma:v7:typescript-prereqs:json
npm run prisma:v7:env-loading
npm run prisma:v7:env-loading:json
npm run prisma:v7:removed-surfaces
npm run prisma:v7:removed-surfaces:json
npm run prisma:v7:support-surface
npm run prisma:v7:support-surface:json
npm run prisma:v7:esm-surface
npm run prisma:v7:esm-surface:json
```

各 entrypoint は既存の read-only probe をそのまま実行します。依存 version、`package-lock.json`、Prisma schema/config、generated client、D1、Cloudflare 設定、#3114 の一時 audit 例外を変更しません。

7種類すべての probe は対応する `:json` entrypoint を持ち、human-readable probe と同じ evidence object を one-line JSON で返します。JSON mode は `GITHUB_STEP_SUMMARY` に Markdown を追記しません。将来 script path や probe 構成を整理する場合も、human-readable / JSON の npm entrypoint とその回帰テストを同時に更新し、手動 review と自動処理の呼び出し口を安定させます。

これらは Prisma 7 への自動 upgrade gate ではありません。major-version migration を実施する場合は `docs/prisma-v7-migration-readiness.md` の判断境界と検証項目に従い、依存 package set、schema/config、generated-client import、D1 driver adapter wiring、ESM 対応、Cloudflare/D1 検証を明示的な migration PR でまとめて評価します。
