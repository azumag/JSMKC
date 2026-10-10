# main の必須ステータスチェック

`main` は branch protection で保護されており、PR を merge するには次の 2 つの
必須ステータスチェックが成功している必要があります。

- `Lint & Test`（通常 `CI` workflow / `.github/workflows/ci.yml`）
- `Prisma / D1 migration parity`（通常 `CI` workflow / `.github/workflows/ci.yml`）

`Claude Code Review` 互換 workflow は引き続き advisory です。check 名は
`PR Compatibility Lint & Test` として分離されており、required context の選択が
曖昧にならないようにしています。

## 実測による確認

repository の merge policy は workflow の定義ではなく GitHub 側の設定なので、
設定変更後は公開 branch endpoint を直接確認します。

```sh
node smkc-score-app/scripts/verify-required-status-checks.cjs --json
```

verifier は `main` が保護されていること、required status checks の enforcement が
有効であること、上記 2 件が required context として登録されていることを検証し、
どれか欠けると非ゼロで終了します。`GH_TOKEN` / `GITHUB_TOKEN` は public
repository では任意ですが、anonymous API の rate limit を避けたい場合に渡します。

## 運用上の注意

- required な check が pending / failure の PR は merge できません。check 名や
  workflow の path filter を変更すると、PR にその check が報告されなくなり
  「待機中」のまま merge できなくなるため、`.github/workflows/ci.yml` の
  trigger を変える場合は required context への影響も確認します。
- 管理者は branch protection の例外として merge できますが、通常の PR は
  required status checks の成功を前提とします。
