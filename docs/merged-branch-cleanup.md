# Merged branch cleanup

`.github/workflows/delete-merged-branch.yml` removes the head branch after a pull request from this repository is merged.

## Safety boundary

The workflow runs only when the pull request is closed as merged and the head repository is the same repository. It keeps `contents: write` because deleting a Git ref requires write access, but it does not check out repository contents or persist credentials in Git configuration.

## Failure policy

Branch deletion is idempotent, but the GitHub REST endpoints do not use the same missing-ref status for every operation. `Get a reference` reports a missing ref as HTTP 404, while `Delete a reference` documents 204, 409, and 422 responses rather than a 404 missing-ref contract.

The workflow therefore probes the branch with `Get a reference` before deletion. A 404 means another cleanup path already removed the branch and is accepted as success. Other preflight errors fail the job.

If the delete call itself fails, the workflow probes the ref again. A 404 at that point means the branch disappeared concurrently and is accepted as success; if the ref still exists, or the second probe fails for another reason, the original deletion error is preserved and the job fails. This keeps authentication failures, permission failures, rate limits, conflicts, and service errors visible without reporting an already-removed branch as a cleanup regression.

The cleanup job has a five-minute timeout because it performs only GitHub API operations and should not occupy a runner indefinitely.
