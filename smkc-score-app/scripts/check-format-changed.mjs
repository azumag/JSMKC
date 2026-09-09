import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import formatChangedUtils from './format-changed-utils.cjs';

const {
  buildGitErrorMessage,
  collectChangedAppFiles,
  describeRequestedBase,
  resolveBaseRevision,
  resolveComparisonBase,
} = formatChangedUtils;

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(appRoot, '..');
const appPrefix = `${path.basename(appRoot)}/`;

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function main() {
  const headRevision = process.env.FORMAT_HEAD_SHA;
  let baseRevision;
  try {
    baseRevision = resolveBaseRevision(
      process.env.FORMAT_BASE_SHA,
      () => git(['merge-base', 'origin/main', 'HEAD']),
      () => git(['rev-parse', 'HEAD^']),
    );
  } catch (error) {
    const requestedBase = describeRequestedBase(process.env.FORMAT_BASE_SHA);
    throw new Error(buildGitErrorMessage(`Unable to resolve formatting base revision: ${requestedBase}`, error), {
      cause: error,
    });
  }

  let comparisonBase;
  try {
    // A PR's base branch may advance after the feature branch was created. Diff
    // from the common ancestor so newly merged base-branch files are not mistaken
    // for changes made by this PR.
    comparisonBase = resolveComparisonBase(baseRevision, headRevision, (base, head) => git(['merge-base', base, head]));
  } catch (error) {
    const context =
      error instanceof Error ? error.message : `Unable to resolve formatting base revision: ${baseRevision}`;
    throw new Error(buildGitErrorMessage(context, error), { cause: error });
  }

  const diffArguments = ['diff', '--name-only', '--diff-filter=ACMR', '-z', comparisonBase];
  if (headRevision) diffArguments.push(headRevision);
  let diffOutput;
  try {
    diffOutput = execFileSync('git', diffArguments, { cwd: repositoryRoot, encoding: 'utf8' });
  } catch (error) {
    const range = headRevision ? `${comparisonBase}..${headRevision}` : `${comparisonBase}..working tree`;
    throw new Error(buildGitErrorMessage(`Unable to list changed files for ${range}.`, error), { cause: error });
  }

  // CI checks committed revisions. Locally, include untracked files as well so a
  // newly created source file cannot bypass the same check before its first commit.
  let untrackedOutput = '';
  if (!headRevision) {
    try {
      untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
    } catch (error) {
      throw new Error(buildGitErrorMessage('Unable to list untracked files.', error), { cause: error });
    }
  }
  const changedFiles = collectChangedAppFiles(diffOutput, untrackedOutput, !headRevision, appPrefix);

  if (changedFiles.length === 0) {
    console.log('No changed Prettier-supported files to check.');
    return 0;
  }

  console.log(`Checking formatting for ${changedFiles.length} changed file(s).`);
  const prettierExecutable = path.join(
    appRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
  );

  // Temporary diagnostics for PR #3237. Format the runner worktree only and
  // print the resulting patch so the exact Prettier change can be committed.
  const diagnostic = spawnSync(prettierExecutable, ['--write', ...changedFiles], {
    cwd: appRoot,
    stdio: 'inherit',
  });
  if (diagnostic.error) throw diagnostic.error;
  const diagnosticDiff = execFileSync('git', ['diff', '--', ...changedFiles.map((file) => `${appPrefix}${file}`)], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  console.log(diagnosticDiff);
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Formatting check failed.');
  process.exitCode = 1;
}
