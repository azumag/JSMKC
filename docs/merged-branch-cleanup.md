# Merged branch cleanup

`.github/workflows/delete-merged-branch.yml` removes the head branch after a pull request from this repository is merged.

## Safety boundary

The workflow runs only when the pull request is closed as merged and the head repository is the same repository. It keeps `contents: write` because deleting a Git ref requires write access, but it does not check out repository contents or persist credentials in Git configuration.

## Failure policy

Branch deletion is idempotent. A successful GitHub API deletion completes normally, and HTTP 404 is also accepted because the branch may already have been removed by another cleanup path.

Other GitHub API failures are not treated as successful cleanup. Authentication failures, permission failures, rate limits, and service errors are written to stderr and fail the job so branch-cleanup regressions remain visible instead of being reported as "already deleted".

The cleanup job has a five-minute timeout because it performs a single GitHub API mutation and should not occupy a runner indefinitely.
