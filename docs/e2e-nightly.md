# Nightly E2E workflow

`.github/workflows/e2e-nightly.yml` runs the preview E2E suite on a schedule and by manual dispatch.

## Admin profile prerequisite

The workflow requires `E2E_PROFILE_ARCHIVE`, which contains the persistent browser profile with an authenticated preview admin session. This prerequisite is checked before checkout, Node setup, dependency installation, or Playwright browser setup. If the secret is missing, the job exits immediately with an explicit error without printing the secret value.

Failing early is intentional: a GitHub-hosted runner cannot supply a local authenticated profile later in the job, so continuing through npm and browser bootstrap would only spend Actions time before the admin-session preflight inevitably fails.

After the prerequisite passes, the profile is restored under `/tmp/playwright-smkc-preview-profile` immediately before the E2E suite. Invalid base64 or tar data is treated as a hard restore failure rather than being downgraded to a warning.

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

The workflow uploads `/tmp/e2e-output/console.log` with `if: always()` when a console log exists. These logs are short-lived debugging evidence rather than release artifacts, so `retention-days` is fixed to 14 days instead of inheriting a potentially longer repository default.

If the prerequisite check fails before the E2E suite creates the log, `if-no-files-found: ignore` keeps the artifact step from introducing a second failure.

## Separate runtime prerequisites

The browser cache does not provide an authenticated preview session and does not change Cloudflare/D1 access. The following remain independent prerequisites:

- `E2E_PROFILE_ARCHIVE` for the persistent authenticated admin browser profile;
- `E2E_BASE_URL` (or the workflow default preview URL);
- Cloudflare credentials when strict preview D1 schema preflight is required.

Browser cache failures should be diagnosed separately from those environment or authentication failures.
