# Prisma upstream evidence consistency probe

`smkc-score-app/scripts/security-audit-upstream-issue.js` is the canonical read-only upstream evidence probe for Issue #3114. It performs a two-pass consistency check before publishing evidence. The implementation that performs one bounded GitHub API pass lives in `security-audit-upstream-issue-single-pass.js` and is an internal building block.

The probe reads `prisma/orm#30052`, the merged fix PR `prisma/orm#30189`, and the latest issue-comment metadata. Those resources can change while a probe is running. A comment can be added, the issue can close or reopen, or metadata can be edited between requests. In that race window a single pass can combine values that never represented one stable upstream snapshot.

The consistency layer executes the existing bounded, redirect-rejecting single-pass probe twice and compares the upstream-owned fields while intentionally excluding the local `checkedAt` value from the equality snapshot. The two local observation timestamps still have a chronology contract: both must be valid timestamps and the second pass must not report a time earlier than the first pass. A backwards clock jump makes the evidence chronology unreliable, so the probe fails closed instead of publishing it.

The probe also fails closed if the issue state, comment count, issue timestamps, latest-comment metadata, or fix-PR evidence differs between the two reads. Only the second snapshot is returned and published when both reads agree and the observation clock is monotonic.

Both reads share one `AbortSignal.timeout(30000)` budget. The second pass does not receive a fresh 30-second allowance, so a slow or stalled GitHub API cannot turn the consistency check into an approximately 60-second operation. Timeout remains fail-closed and produces no trusted consistency evidence.

Failure diagnostics printed by the canonical consistency probe are treated as external-input-adjacent data because they can originate from GitHub API transport failures or JSON parser errors. Before writing them to stderr, `security-audit-upstream-diagnostic.js` converts C0 controls, DEL, C1 controls (`U+0080`〜`U+009F`), U+2028/U+2029, and Unicode `Bidi_Control` characters to visible escapes, preserves ordinary Unicode, and caps the diagnostic body at 500 characters. Escaping the C1 range also prevents values such as `U+009B` (CSI) from being interpreted as terminal control sequences. This keeps a malformed response from introducing extra CI log lines or display/terminal controls while leaving the internal exception and successful evidence contracts unchanged. The single-pass module remains an internal building block; the published diagnostic boundary is the canonical consistency entrypoint.

Run the canonical command from `smkc-score-app`:

```bash
npm run security:audit:upstream-issue
npm run security:audit:upstream-issue:json
```

Direct execution remains equivalent:

```bash
node scripts/security-audit-upstream-issue.js
node scripts/security-audit-upstream-issue.js --json
```

This probe is advisory only. It does not change the compatible remediation gate, modify dependencies, remove the temporary GHSA-ggr8-5vv4-36mx exception, or authorize a Prisma major upgrade. A detected upstream race, malformed upstream response, unsafe diagnostic, or backwards observation clock should be retried later rather than interpreted as remediation evidence.
