# Changed-file formatting check

CI の formatting gate は `smkc-score-app` 配下で今回変更された Prettier 対応ファイルだけを `npm run format:check` で検査する。PR では base branch の現在値ではなく merge-base を比較起点にするため、PR 作成後に `main` へ追加された無関係なファイルは対象に含めない。

`prettier --check` が失敗した場合、`scripts/check-format-changed.mjs` は失敗した gate の exit code を維持したまま、各 changed file を Prettier の stdout へ整形し、元ファイルとの差分を `git diff --no-index` で生成して CI log に表示する。この診断経路は repository working tree を変更しない。

ファイル名は shell command string へ展開せず child-process の argument 配列として渡すため、空白を含む path も同じ経路で扱う。さらに Prettier に渡す file operand は `./` 付きの明示的な relative path に正規化するため、`--write.ts` のように `-` で始まるファイル名も CLI option として解釈されない。ログと `git diff` では元の repository-relative path を維持する。

複数ファイルは個別に診断し、あるファイルの parser error や診断生成失敗が別ファイルの修正差分表示を妨げない。診断生成自体に失敗した場合も、元の formatting failure は成功へ変換しない。

ローカルで修正する場合は通常どおり `npm run format` または対象ファイルへの `prettier --write` を使用し、CI に表示された diff は必要な整形内容を確認するための read-only 診断として扱う。
