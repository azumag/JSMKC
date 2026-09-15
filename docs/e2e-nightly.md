# Nightly E2E workflow

`.github/workflows/e2e-nightly.yml` runs the preview E2E suite on a schedule and by manual dispatch.

## Playwright browser cache

The E2E runtime does not use Playwright's default `~/.cache/ms-playwright` directory. `smkc-score-app/e2e/lib/browser-env.js` resolves the managed browser directory from `E2E_BROWSER_HOME`, which the nightly workflow fixes to:

```text
/tmp/playwright-e2e-home/ms-playwright
```

The workflow therefore treats that exact directory as the cache contract:

1. restore the exact cache key derived from the runner OS and `smkc-score-app/package-lock.json`;
2. run `npm run e2e:install-browser` so the expected Chromium revision exists even on a cache miss;
3. save a newly installed browser immediately, before the preview/admin-session E2E preflight runs.

Saving before the E2E suite is intentional. A missing or expired `E2E_PROFILE_ARCHIVE`, a preview outage, or another downstream E2E failure must not cause the next run to download the Playwright browser binaries again.

Broad `restore-keys` are intentionally not used. A cache created for an older lockfile may contain a different Playwright browser revision, so only the exact lockfile key is restored.

## Separate runtime prerequisites

The browser cache does not provide an authenticated preview session and does not change Cloudflare/D1 access. The following remain independent prerequisites:

- `E2E_PROFILE_ARCHIVE` for the persistent authenticated admin browser profile;
- `E2E_BASE_URL` (or the workflow default preview URL);
- Cloudflare credentials when strict preview D1 schema preflight is required.

Browser cache failures should be diagnosed separately from those environment or authentication failures.
