import {
  NPM_VIEW_DIAGNOSTIC_MAX_LENGTH,
  runNpmView,
  sanitizeNpmViewDiagnostic,
} from '../../scripts/security-audit-upstream.js';

describe('security audit npm view diagnostics', () => {
  it('escapes control characters and Unicode line separators into one visible line', () => {
    const safe = sanitizeNpmViewDiagnostic('first\nsecond\t\u001b[31mred\u007f\u2028tail\u2029');

    expect(safe).toBe('first\\nsecond\\t\\x1b[31mred\\x7f\\u2028tail\\u2029');
    expect(safe).not.toMatch(/[\u0000-\u001f\u007f\u2028\u2029]/);
  });

  it('bounds long diagnostics after making control characters visible', () => {
    const safe = sanitizeNpmViewDiagnostic(`prefix\n${'x'.repeat(NPM_VIEW_DIAGNOSTIC_MAX_LENGTH + 100)}`);

    expect(safe).toHaveLength(NPM_VIEW_DIAGNOSTIC_MAX_LENGTH);
    expect(safe).toContain('prefix\\n');
    expect(safe.endsWith('...')).toBe(true);
  });

  it('sanitizes non-zero npm stderr before exposing it in the error', () => {
    const spawn = jest.fn(() => ({
      status: 1,
      stdout: '',
      stderr: 'npm ERR!\n::warning::spoof\u001b[31m\u007f',
      error: undefined,
    }));

    expect(() => runNpmView('prisma@^6.19.3', 'version', spawn as never)).toThrow(
      'npm view failed for prisma@^6.19.3: npm ERR!\\n::warning::spoof\\x1b[31m\\x7f',
    );
  });

  it('sanitizes and bounds spawn errors before exposing them in the error', () => {
    const spawn = jest.fn(() => ({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error(`timeout\n${'x'.repeat(NPM_VIEW_DIAGNOSTIC_MAX_LENGTH + 100)}\u001b[31m`),
    }));

    let thrown: Error | undefined;
    try {
      runNpmView('prisma@^6.19.3', 'version', spawn as never);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown?.message).not.toMatch(/[\n\r\t\u001b\u007f\u2028\u2029]/);
    expect(thrown?.message).toContain('failed to run npm view for prisma@^6.19.3: timeout\\n');
    expect(thrown?.message.length).toBeLessThanOrEqual(
      'failed to run npm view for prisma@^6.19.3: '.length + NPM_VIEW_DIAGNOSTIC_MAX_LENGTH,
    );
  });
});
