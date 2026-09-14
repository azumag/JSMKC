'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeDiagnosticDiff(diffOutput, displayPath) {
  const normalizedPath = displayPath.replaceAll('\\', '/');
  let inHunk = false;

  return diffOutput
    .split('\n')
    .map((line) => {
      if (line.startsWith('@@')) inHunk = true;
      if (inHunk) return line;
      if (line.startsWith('diff --git ')) return `diff --git a/${normalizedPath} b/${normalizedPath}`;
      if (line.startsWith('--- ')) return `--- a/${normalizedPath}`;
      if (line.startsWith('+++ ')) return `+++ b/${normalizedPath}`;
      return line;
    })
    .join('\n');
}

function commandError(prefix, result) {
  if (result.error) return `${prefix}: ${result.error.message}`;
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
  return stderr ? `${prefix}: ${stderr}` : prefix;
}

function buildPrettierDiagnosticDiff(
  file,
  {
    appRoot,
    prettierExecutable,
    spawnSyncImpl = spawnSync,
    fsImpl = fs,
    tempRoot = os.tmpdir(),
  },
) {
  const prettierResult = spawnSyncImpl(prettierExecutable, [file], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (prettierResult.error || prettierResult.status !== 0) {
    return { diff: '', error: commandError(`Unable to render Prettier output for ${file}`, prettierResult) };
  }

  const tempDirectory = fsImpl.mkdtempSync(path.join(tempRoot, 'jsmkc-prettier-diagnostic-'));
  const formattedPath = path.join(tempDirectory, path.basename(file));
  const originalPath = path.resolve(appRoot, file);

  try {
    fsImpl.writeFileSync(formattedPath, prettierResult.stdout, 'utf8');
    const diffResult = spawnSyncImpl('git', ['diff', '--no-index', '--no-color', '--', originalPath, formattedPath], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (diffResult.error || (diffResult.status !== 0 && diffResult.status !== 1)) {
      return { diff: '', error: commandError(`Unable to build formatting diff for ${file}`, diffResult) };
    }

    return {
      diff: diffResult.status === 1 ? normalizeDiagnosticDiff(diffResult.stdout, file) : '',
      error: '',
    };
  } finally {
    fsImpl.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  buildPrettierDiagnosticDiff,
  commandError,
  normalizeDiagnosticDiff,
};
