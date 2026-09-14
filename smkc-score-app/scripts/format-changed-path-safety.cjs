const path = require('node:path');

function assertSafeChangedFiles(changedFiles, appRoot, lstatSync) {
  if (!Array.isArray(changedFiles)) {
    throw new Error('Changed formatting paths must be an array.');
  }
  if (typeof appRoot !== 'string' || appRoot.length === 0) {
    throw new Error('Formatting app root must be a non-empty path.');
  }
  if (typeof lstatSync !== 'function') {
    throw new Error('Formatting path validator requires lstatSync.');
  }

  for (const file of changedFiles) {
    if (typeof file !== 'string' || file.length === 0) {
      throw new Error('Changed formatting path must be a non-empty string.');
    }

    const absolutePath = path.resolve(appRoot, file);
    const relativePath = path.relative(appRoot, absolutePath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
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
  }

  return changedFiles;
}

module.exports = {
  assertSafeChangedFiles,
};
