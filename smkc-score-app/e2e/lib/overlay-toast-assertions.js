const OVERLAY_TOAST_TITLE_PATTERN =
  /(更新|確定|終了|申告|タイム|Updated|Locked|Completed|Started|Reported|Qualification|Ranking|Time\s+Attack)/i;

function hasKnownOverlayToastTitle(text) {
  return OVERLAY_TOAST_TITLE_PATTERN.test(text || '');
}

module.exports = {
  hasKnownOverlayToastTitle,
};
