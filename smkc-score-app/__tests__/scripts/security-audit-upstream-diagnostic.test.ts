import fs from 'node:fs';
import path from 'node:path';

import {
  UPSTREAM_DIAGNOSTIC_MAX_LENGTH,
  formatUpstreamProbeFailure,
  sanitizeUpstreamDiagnostic,
} from '../../scripts/security-audit-upstream-diagnostic.js';

describe('Prisma upstream probe diagnostic safety', () => {
  it('escapes C0/C1 controls, line separators, and Unicode bidi controls while preserving ordinary Unicode', () => {
    const diagnostic =
      'first\nsecond\t\u001b[31mred\u007f\u0080\u009b\u009f\u061c\u200e\u200f\u2028\u2029\u202a\u202e\u2066\u2069 日本語';

    expect(sanitizeUpstreamDiagnostic(diagnostic)).toBe(
      'first\\nsecond\\t\\x1b[31mred\\x7f\\u0080\\u009b\\u009f\\u061c\\u200e\\u200f\\u2028\\u2029\\u202a\\u202e\\u2066\\u2069 日本語',
    );
  });

  it('bounds external diagnostics without dropping the visible truncation marker', () => {
    const diagnostic = sanitizeUpstreamDiagnostic('x'.repeat(UPSTREAM_DIAGNOSTIC_MAX_LENGTH + 100));

    expect(diagnostic).toHaveLength(UPSTREAM_DIAGNOSTIC_MAX_LENGTH);
    expect(diagnostic.endsWith('...')).toBe(true);
  });

  it('fails closed on an invalid diagnostic length contract', () => {
    expect(() => sanitizeUpstreamDiagnostic('value', 3)).toThrow(
      'upstream diagnostic maxLength must be a safe integer >= 4',
    );
  });

  it('formats malformed JSON and transport-style failures as one bounded stderr line', () => {
    const malformedJson = new Error('upstream issue response was not valid JSON: Unexpected token\n\u009b31m\u202ehidden');
    const formatted = formatUpstreamProbeFailure(
      'Failed to fetch consistent Prisma upstream issue evidence',
      malformedJson,
    );

    expect(formatted).toBe(
      'Failed to fetch consistent Prisma upstream issue evidence: upstream issue response was not valid JSON: Unexpected token\\n\\u009b31m\\u202ehidden\n',
    );
    expect(formatted.split('\n')).toHaveLength(2);
  });

  it('does not invoke arbitrary object coercion while handling an unexpected thrown value', () => {
    const hostile = {
      toString() {
        throw new Error('must not be called');
      },
    };

    expect(() => formatUpstreamProbeFailure('Failed upstream probe', hostile)).not.toThrow();
    expect(formatUpstreamProbeFailure('Failed upstream probe', hostile)).toBe('Failed upstream probe\n');
    expect(formatUpstreamProbeFailure('Failed upstream probe', 'plain string failure')).toBe(
      'Failed upstream probe: plain string failure\n',
    );
  });

  it('keeps the canonical consistency entrypoint on the sanitizer for all top-level failure paths', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'scripts', 'security-audit-upstream-issue-consistency.js'),
      'utf8',
    );

    expect(source).toContain("formatUpstreamProbeFailure('Invalid upstream issue consistency probe arguments', error)");
    expect(source).toContain(
      "formatUpstreamProbeFailure('Failed to fetch consistent Prisma upstream issue evidence', error)",
    );
    expect(source).toContain(
      "formatUpstreamProbeFailure('Failed to publish consistent upstream issue outputs', error)",
    );
    expect(source).not.toContain('${error.message}');
  });
});
