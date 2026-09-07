# CDM 2026 preview acceptance evidence

Issue #3050 requires the BM / MR / GP `TC-3040` preview scenarios to be executed and the tested environment, commit and result to be recorded. The helper below keeps that evidence together in a machine-readable JSON file while preserving the existing fail-fast preview E2E behavior.

## Run

From `smkc-score-app`:

```bash
node e2e/run-cdm-acceptance.js
```

The runner:

1. forces `E2E_TESTS=TC-3040`;
2. resolves the normal preview runtime environment with the existing `run-preview` helpers;
3. runs `tc-bm.js`, `tc-mr.js`, then `tc-gp.js` sequentially;
4. stops on the first failed track;
5. records the exact 40-character Git commit SHA, preview URL, timestamps, per-track result and overall result;
6. writes `artifacts/cdm-acceptance-TC-3040.json` by default.

Use a different output location when attaching or archiving evidence:

```bash
node e2e/run-cdm-acceptance.js --output artifacts/cdm-acceptance-2026-09-08.json
```

`CDM_ACCEPTANCE_EVIDENCE_PATH` can also set the default output path when `--output` is not supplied.

## Evidence shape

A successful run has this shape:

```json
{
  "schemaVersion": 1,
  "testCase": "TC-3040",
  "environment": "preview",
  "appUrl": "https://preview.example.test",
  "commitSha": "0123456789abcdef0123456789abcdef01234567",
  "startedAt": "2026-09-08T00:00:00.000Z",
  "finishedAt": "2026-09-08T00:10:00.000Z",
  "resultSummary": "PASS",
  "tracks": [
    {
      "track": "BM",
      "script": "tc-bm.js",
      "status": "PASS",
      "exitCode": 0,
      "startedAt": "2026-09-08T00:00:00.000Z",
      "finishedAt": "2026-09-08T00:03:00.000Z"
    }
  ]
}
```

On failure, the failed track is recorded as `FAIL`. Tracks after the first failure are recorded as `NOT_RUN`, so a partial run cannot be mistaken for a complete acceptance pass. If a preview runner throws before returning an exit code, the error message is included in the failed track entry without dumping the runtime environment or credentials.

## Scope and remaining manual acceptance

This helper only covers the automated BM / MR / GP `TC-3040` preview requirement. It does **not** turn the rest of Issue #3050 into an automated pass. The acceptance record still needs the applicable manual evidence, including:

- CDM XLSM opened in Excel with macros, formulas, seeds and results checked;
- database / migration version when relevant;
- tester and browser / Excel version;
- reproduction details, tournament ID and supporting evidence for any failure;
- the remaining P0 acceptance cases outside `TC-3040`.

Do not record secrets, session cookies, tokens or database credentials in the evidence JSON or in the GitHub issue.
