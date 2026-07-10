import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(appRoot, '..');
const appPrefix = `${path.basename(appRoot)}/`;
const supportedExtension = /\.(?:cjs|css|graphql|gql|html|js|json|jsx|md|mdx|mjs|scss|ts|tsx|yaml|yml)$/i;

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function resolveBaseRevision() {
  if (process.env.FORMAT_BASE_SHA) return process.env.FORMAT_BASE_SHA;

  // Local feature branches normally track origin/main. Keeping the fallback in
  // this script makes `npm run format:check` behave like CI without requiring
  // developers to copy a GitHub-specific command.
  try {
    return git(['merge-base', 'origin/main', 'HEAD']);
  } catch {
    return git(['rev-parse', 'HEAD^']);
  }
}

const baseRevision = resolveBaseRevision();
const headRevision = process.env.FORMAT_HEAD_SHA;
// A PR's base branch may advance after the feature branch was created. Diff
// from the common ancestor so newly merged base-branch files are not mistaken
// for changes made by this PR.
const comparisonBase = headRevision ? git(['merge-base', baseRevision, headRevision]) : baseRevision;
const diffArguments = ['diff', '--name-only', '--diff-filter=ACMR', '-z', comparisonBase];
if (headRevision) diffArguments.push(headRevision);

const changedPaths = execFileSync('git', diffArguments, { cwd: repositoryRoot, encoding: 'utf8' }).split('\0');

// CI checks committed revisions. Locally, include untracked files as well so a
// newly created source file cannot bypass the same check before its first commit.
if (!process.env.FORMAT_HEAD_SHA) {
  changedPaths.push(
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).split('\0'),
  );
}

const changedFiles = [...new Set(changedPaths)]
  .filter(Boolean)
  .filter((file) => file.startsWith(appPrefix) && supportedExtension.test(file))
  .map((file) => file.slice(appPrefix.length));

if (changedFiles.length === 0) {
  console.log('No changed Prettier-supported files to check.');
  process.exit(0);
}

console.log(`Checking formatting for ${changedFiles.length} changed file(s).`);
const prettierExecutable = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
);
const result = spawnSync(prettierExecutable, ['--check', ...changedFiles], {
  cwd: appRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
