# Qualification TV assignment rollback

BM / MR / GP の qualification 画面では、TV 番号の変更を先に optimistic UI へ反映してから共通 `useQualificationActions.handleTvAssign()` が PATCH を fire-and-forget で送る。

成功時は余分な refetch を行わず従来どおり silent に完了する。non-2xx または request rejection の場合は既存の API 固有 error / `common.networkError` を表示した後、`refetch()` を1回実行して server の authoritative state を再取得し、失敗した optimistic TV 番号を即座に戻す。

PATCH endpoint、payload、成功時の polling 契約は変更しない。