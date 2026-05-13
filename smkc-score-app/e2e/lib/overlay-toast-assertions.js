const OVERLAY_TOAST_TITLE_PATTERN =
  /(更新|確定|終了|申告|タイム|Updated|Locked|Completed|Started|Reported|Qualification|Ranking|Time\s+Attack)/i;

const OVERLAY_TOAST_TITLE_CASES = [
  '総合順位を更新しました',
  '予選確定',
  '試合終了',
  'スコア申告',
  'タイム更新',
  'Overall Ranking Updated',
  'Qualification Locked',
  'Match Completed',
  'Time Attack Phase 1 Started',
  'Score Reported',
  'Qualification summary',
  'Ranking snapshot',
  'タイムトライアル予選を完走',
];

const OVERLAY_TOAST_TITLE_REJECTIONS = [
  'Server Time: 2026-05-01T00:00:00.000Z',
  'Time',
];

function hasKnownOverlayToastTitle(text) {
  return OVERLAY_TOAST_TITLE_PATTERN.test(text || '');
}

module.exports = {
  OVERLAY_TOAST_TITLE_CASES,
  OVERLAY_TOAST_TITLE_REJECTIONS,
  hasKnownOverlayToastTitle,
};
