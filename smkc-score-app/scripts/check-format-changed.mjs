import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(appRoot, '..');
const prettierExecutable = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');

execFileSync(prettierExecutable, ['--write', 'jest.config.ts'], { cwd: appRoot, stdio: 'inherit' });
process.stdout.write(execFileSync('git', ['diff', '--', 'smkc-score-app/jest.config.ts'], { cwd: repositoryRoot, encoding: 'utf8' }));
process.exitCode = 1;
