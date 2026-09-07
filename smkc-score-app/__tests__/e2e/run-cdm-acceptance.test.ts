type CdmAcceptanceRunner = typeof import('../../e2e/run-cdm-acceptance');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cdmAcceptanceRunner = require(
  '../../e2e/run-cdm-acceptance',
) as CdmAcceptanceRunner;
const { CDM_TARGETS, parseCliArgs, resolveCommitSha, runCdmAcceptance } =
  cdmAcceptanceRunner;

describe('CDM preview acceptance evidence runner', () => {
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  const env = {
    E2E_BASE_URL: 'https://preview.example.test',
    E2E_PROFILE_DIR: '/tmp/jsmkc-test-profile',
  };
  const fixedNow = () => new Date('2026-09-08T00:00:00.000Z');

  it('runs BM, MR and GP in order with TC-3040 and writes PASS evidence', async () => {
    const calls: Array<{ script: string; testFilter: string | undefined }> = [];
    const writes: Array<{ path: string; content: string; encoding: string }> = [];

    const result = await runCdmAcceptance({
      env,
      commitSha,
      now: fixedNow,
      outputPath: '/tmp/cdm-acceptance.json',
      runTarget: async (script: string, runtimeEnv: Record<string, string>) => {
        calls.push({ script, testFilter: runtimeEnv.E2E_TESTS });
        return 0;
      },
      mkdir: () => undefined,
      writeFile: (filePath: string, content: string, encoding: string) => {
        writes.push({ path: filePath, content, encoding });
      },
    });

    expect(calls).toEqual(
      CDM_TARGETS.map((target: { script: string }) => ({
        script: target.script,
        testFilter: 'TC-3040',
      })),
    );
    expect(result.exitCode).toBe(0);
    expect(result.evidence).toMatchObject({
      schemaVersion: 1,
      testCase: 'TC-3040',
      environment: 'preview',
      appUrl: 'https://preview.example.test',
      commitSha,
      resultSummary: 'PASS',
    });
    expect(result.evidence.tracks.map((track: { status: string }) => track.status)).toEqual([
      'PASS',
      'PASS',
      'PASS',
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/tmp/cdm-acceptance.json');
    expect(writes[0].encoding).toBe('utf8');
    expect(JSON.parse(writes[0].content)).toEqual(result.evidence);
  });

  it('fails fast and marks later tracks NOT_RUN while preserving evidence', async () => {
    const calls: string[] = [];

    const result = await runCdmAcceptance({
      env,
      commitSha,
      now: fixedNow,
      runTarget: async (script: string) => {
        calls.push(script);
        return script === 'tc-mr.js' ? 5 : 0;
      },
      mkdir: () => undefined,
      writeFile: () => undefined,
    });

    expect(calls).toEqual(['tc-bm.js', 'tc-mr.js']);
    expect(result.exitCode).toBe(5);
    expect(result.evidence.resultSummary).toBe('FAIL');
    expect(result.evidence.tracks).toEqual([
      expect.objectContaining({ track: 'BM', status: 'PASS', exitCode: 0 }),
      expect.objectContaining({ track: 'MR', status: 'FAIL', exitCode: 5 }),
      expect.objectContaining({ track: 'GP', status: 'NOT_RUN', exitCode: null }),
    ]);
  });

  it('records a thrown target error as failure and still writes evidence', async () => {
    let writtenEvidence: unknown;

    const result = await runCdmAcceptance({
      env,
      commitSha,
      now: fixedNow,
      runTarget: async () => {
        throw new Error('preview session expired');
      },
      mkdir: () => undefined,
      writeFile: (_filePath: string, content: string) => {
        writtenEvidence = JSON.parse(content);
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.evidence.tracks[0]).toMatchObject({
      track: 'BM',
      status: 'FAIL',
      exitCode: null,
      error: 'preview session expired',
    });
    expect(result.evidence.tracks[1].status).toBe('NOT_RUN');
    expect(result.evidence.tracks[2].status).toBe('NOT_RUN');
    expect(writtenEvidence).toEqual(result.evidence);
  });

  it('parses an optional evidence output path and rejects unknown arguments', () => {
    expect(parseCliArgs([])).toEqual({ outputPath: undefined });
    expect(parseCliArgs(['--output', 'artifacts/result.json'])).toEqual({
      outputPath: 'artifacts/result.json',
    });
    expect(() => parseCliArgs(['--unknown'])).toThrow('Unknown argument');
    expect(() => parseCliArgs(['--output'])).toThrow('Missing value for --output');
  });

  it('requires a full commit SHA for acceptance evidence', () => {
    expect(
      resolveCommitSha(() => ({
        status: 0,
        signal: null,
        error: undefined,
        stdout: `${commitSha}\n`,
      })),
    ).toBe(commitSha);

    expect(() =>
      resolveCommitSha(() => ({
        status: 0,
        signal: null,
        error: undefined,
        stdout: 'deadbeef\n',
      })),
    ).toThrow('full 40-character Git SHA');
  });
});
