const supportedExtension = /\.(?:cjs|css|graphql|gql|html|js|json|jsx|md|mdx|mjs|scss|ts|tsx|yaml|yml)$/i;

function resolveBaseRevision(environmentBase, resolveMergeBase, resolveParent) {
  if (environmentBase && !/^0+$/.test(environmentBase)) return environmentBase;

  // A branch-creation push has an all-zero `before` SHA. Comparing with HEAD^
  // checks the newly created commit instead of silently comparing HEAD to itself.
  if (environmentBase) return resolveParent();

  try {
    return resolveMergeBase();
  } catch {
    return resolveParent();
  }
}

function describeRequestedBase(environmentBase) {
  if (environmentBase && /^0+$/.test(environmentBase)) return 'HEAD^';
  return environmentBase || 'origin/main (fallback: HEAD^)';
}

function resolveComparisonBase(baseRevision, headRevision, resolveMergeBase) {
  if (!headRevision) return baseRevision;

  try {
    return resolveMergeBase(baseRevision, headRevision);
  } catch (cause) {
    throw new Error(`Unable to resolve formatting base revision: ${baseRevision}`, { cause });
  }
}

function collectChangedAppFiles(diffOutput, untrackedOutput, includeUntracked, appPrefix) {
  const paths = diffOutput.split('\0');
  if (includeUntracked) paths.push(...untrackedOutput.split('\0'));

  return [...new Set(paths)]
    .filter(Boolean)
    .filter((file) => file.startsWith(appPrefix) && supportedExtension.test(file))
    .map((file) => file.slice(appPrefix.length));
}

function findGitStderr(error) {
  if (!error || typeof error !== 'object') return '';
  const stderr = error.stderr;
  if (typeof stderr === 'string') return stderr.trim();
  if (Buffer.isBuffer(stderr)) return stderr.toString('utf8').trim();
  return findGitStderr(error.cause);
}

function buildGitErrorMessage(context, error) {
  const detail = findGitStderr(error);
  return detail ? `${context}\n${detail}` : context;
}

module.exports = {
  buildGitErrorMessage,
  collectChangedAppFiles,
  describeRequestedBase,
  findGitStderr,
  resolveBaseRevision,
  resolveComparisonBase,
};
