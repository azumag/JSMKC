# TA Phase 3 preview error redaction

TA Phase 3 の結果送信前プレビューは `buildTaRoundPreview()` で生成する。

プレビュー生成時の例外には重複 player ID や不正な player ID / time など、内部実装の診断情報を含む場合がある。そのため、この例外の `Error.message` はユーザー向け UI に直接表示しない。

## 表示契約

- 入力段階で検出できる不正なタイムは既存の `taFinals.invalidTimeFor` を表示する。
- 参加人数不足は既存の `taFinals.needAtLeast2Players` を表示する。
- `buildTaRoundPreview()` 自体が例外を投げた場合は `taFinals.previewError` を表示する。
- 元の例外は `tournaments-ta-finals` client logger に記録し、診断可能性を維持する。
- プレビュー生成に失敗した場合は pending results を確定せず、確認ダイアログを開かない。

API 送信後の error handling は別契約であり、この変更では API-specific error と `common.networkError` fallback の挙動を変更しない。
