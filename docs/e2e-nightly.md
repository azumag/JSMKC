# Nightly E2E workflow

`.github/workflows/e2e-nightly.yml` runs the preview E2E suite on a schedule and by manual dispatch.

## Admin profile prerequisite

The workflow requires `E2E_PROFILE_ARCHIVE`, which contains the persistent browser profile with an authenticated preview admin session. A dedicated preflight job checks this prerequisite before checkout, Node setup, dependency installation, or Playwright browser setup.

Missing-secret handling depends on how the workflow was started:

- scheduled nightly runs emit a notice and skip the E2E job when `E2E_PROFILE_ARCHIVE` is not configured;
- manually dispatched runs fail immediately with an explicit error when the secret is missing.

This keeps unattended schedules from producing a known-red Actions run while the optional credential is not configured, but preserves fail-closed behavior when someone explicitly requests an E2E run. In both cases the secret value is never printed. Once the repository secret is configured, scheduled runs automatically proceed through the full E2E job again.

After the prerequisite passes, the profile is restored under `/tmp/playwright-smkc-preview-profile` immediately before the E2E suite. Invalid base64 or tar data is treated as a hard restore failure rather than being downgraded to a warning.

The authenticated profile is credential-bearing material. Its restore step therefore uses `umask 077`, writes the base64-decoded archive to a run-specific temporary path, removes that archive with an `EXIT` trap even on restore failure, and strips group/other permissions from the extracted profile tree before Playwright uses it. The secret value itself is never echoed to the Actions log.

Before extraction, the workflow also validates the tar archive fail-closed. A valid archive may contain only the top-level `playwright-smkc-preview-profile` entry and regular files/directories below it. Empty archives, absolute paths, `..` path components, additional top-level entries, symbolic links, hard links, devices, FIFOs, and other special entries are rejected before `tar -xzf` runs. Checking both names and member types keeps a malformed or incorrectly packaged secret from escaping the expected preview profile tree or introducing unexpected filesystem objects during restore.

### Create or refresh `E2E_PROFILE_ARCHIVE`

After creating an authenticated preview profile with `npm run e2e:preview:login`, package the directory and encode it with Node.js rather than GNU-specific `base64` flags. The following works on both macOS and Linux as long as the repository's Node.js prerequisite is available:

```bash
cd /tmp
umask 077
tar -czf profile.tar.gz playwright-smkc-preview-profile
node -e "process.stdout.write(require('fs').readFileSync('profile.tar.gz').toString('base64'))" > profile.base64
```

Use the contents of `/tmp/profile.base64` as the repository Actions secret `E2E_PROFILE_ARCHIVE`. Keep the documented top-level directory name unchanged: the nightly restore guard deliberately rejects archives packaged from some other root.

Both `profile.tar.gz` and `profile.base64` contain credential-bearing session material; remove them after updating the secret:

```bash
rm -f /tmp/profile.tar.gz /tmp/profile.base64
```

The repository `.gitignore` also excludes `profile.tar.gz`, `profile.base64`, and `playwright-smkc-preview-profile/` as defense in depth if they are accidentally created inside the working tree. Ignore rules are not credential storage or retention controls: still delete the artifacts after updating the secret.

Do not commit either file or the persistent profile directory to the repository, and do not attach them to an issue, pull request, or ordinary Actions artifact.

## Playwright browser cache

The E2E runtime does not use Playwright's default `~/.cache/ms-playwright` directory. `smkc-score-app/e2e/lib/browser-env.js` resolves the managed browser directory from `E2E_BROWSER_HOME`, which the nightly workflow fixes to:

```text
/tmp/playwright-e2e-home/ms-playwright
```

The workflow therefore treats that exact directory as the cache contract:

1. restore the exact cache key derived from the runner OS and `smkc-score-app/package-lock.json`;
2. run `npm run e2e:install-browser` so the expected Chromium revision exists even on a cache miss;
3. save a newly installed browser immediately, before the preview/admin-session E2E preflight runs.

Saving before the E2E suite is intentional. An expired authenticated profile, a preview outage, or another downstream E2E failure must not cause the next run to download the Playwright browser binaries again.

Broad `restore-keys` are intentionally not used. A cache created for an older lockfile may contain a different Playwright browser revision, so only the exact lockfile key is restored.

## Diagnostic artifact retention

The E2E job uploads `/tmp/e2e-output/console.log` with `if: always()` when a console log exists. These logs are short-lived debugging evidence rather than release artifacts, so `retention-days` is fixed to 14 days instead of inheriting a potentially longer repository default.

When a scheduled run skips the E2E job because the admin profile secret is absent, no console-log artifact is created. If a started E2E job reaches the upload step without producing a log, `if-no-files-found: ignore` prevents the artifact step from introducing a second failure.

## Separate runtime prerequisites

The browser cache does not provide an authenticated preview session and does not change Cloudflare/D1 access. The following remain independent prerequisites:

- `E2E_PROFILE_ARCHIVE` for the persistent authenticated admin browser profile;
- `E2E_BASE_URL` (or the workflow default preview URL);
- Cloudflare credentials when strict preview D1 schema preflight is required.

Browser cache failures should be diagnosed separately from those environment or authentication failures.
