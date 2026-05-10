function normalizeHeaderText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasAnyHeader(headers, labels) {
  const normalized = headers.map(normalizeHeaderText);
  return labels.some((label) =>
    normalized.some((header) => header.includes(label))
  );
}

function assertGpCombinedStandingsHeaders(headers) {
  const normalized = headers.map(normalizeHeaderText);
  const required = [
    { name: 'match points', labels: ['Match Pts', '勝点'] },
    { name: 'driver points', labels: ['Driver Pts', 'ドライバー点'] },
  ];
  const missing = required
    .filter(({ labels }) => !hasAnyHeader(normalized, labels))
    .map(({ name }) => name);

  if (missing.length > 0) {
    throw new Error(
      `GP combined standings missing ${missing.join(' and ')} header(s): ${normalized.join(' | ')}`
    );
  }

  return normalized;
}

module.exports = {
  assertGpCombinedStandingsHeaders,
};
