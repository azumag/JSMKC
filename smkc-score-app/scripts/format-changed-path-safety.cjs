const path = require('node:path');

const unsafeControlCharacterPattern = /[\u0000-\u001f\u007f]/;

function isOutsideRoot(root, candidate) {
  const relativePath = path.relative(root, candidate);
  return relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
}

function assertSafeChangedFiles(changedFiles, appRoot, lstatSync, realpathSync) {
  if (!Array.isArray(changedFiles)) {
    throw new Error('Changed formatting paths must be an array.');
  }
  if (typeof appRoot !== 'string' || appRoot.length === 0) {
    throw new Error('Formatting app root must be a non-empty path.');
  }
  if (typeof lstatSync !== 'function' || typeof realpathSync !== 'function') {
    throw new Error('Formatting path validator requires lstatSync and realpathSync.');
  }

  let realAppRoot;
  try {
    realAppRoot = realpathSync(appRoot);
  } catch (error) {
    throw new Error('Unable to resolve the formatting app root.', { cause: error });
  }

  for (const file of changedFiles) {
    if (typeof file !== 'string' || file.length === 0) {
      throw new Error('Changed formatting path must be a non-empty string.');
    }
    if (unsafeControlCharacterPattern.test(file)) {
      throw new Error('Changed formatting path contains a control character.');
    }

    const absolutePath = path.resolve(appRoot, file);
    if (isOutsideRoot(appRoot, absolutePath)) {
      throw new Error(`Changed formatting path escapes the app root: ${file}`);
    }

    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      throw new Error(`Unable to inspect changed formatting path: ${file}`, { cause: error });
    }

    if (!stats || typeof stats.isFile !== 'function' || !stats.isFile()) {
      throw new Error(`Changed formatting path must be a regular file: ${file}`);
    }

    let realPath;
    try {
      realPath = realpathSync(absolutePath);
    } catch (error) {
      throw new Error(`Unable to resolve changed formatting path: ${file}`, { cause: error });
    }

    if (isOutsideRoot(realAppRoot, realPath)) {
      throw new Error(`Changed formatting path resolves outside the app root: ${file}`);
    }
  }

  return changedFiles;
}

module.exports = {
  assertSafeChangedFiles,
};
