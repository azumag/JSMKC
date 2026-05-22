function describeTc939TabNavigation({ spaMarker, cleanClasses }) {
  const failures = [];

  if (spaMarker !== 'alive') {
    failures.push('Tab click caused a full document reload');
  }

  if (!cleanClasses) {
    failures.push('Hydrated tab className contains extra whitespace');
  }

  return {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    detail: failures.join(' / '),
  };
}

module.exports = {
  describeTc939TabNavigation,
};
