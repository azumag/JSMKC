#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
case "$target" in
  production)
    expected_branch="main"
    migrate_command=(npm run db:migrations:apply)
    deploy_command=(npx wrangler deploy)
    ;;
  preview)
    expected_branch="preview"
    migrate_command=(npm run db:migrations:apply:preview)
    deploy_command=(npx wrangler deploy --env preview)
    ;;
  *)
    echo "Usage: $0 <production|preview>" >&2
    exit 2
    ;;
esac

branch="${WORKERS_CI_BRANCH:-}"

# Feature branches must not apply D1 migrations or deploy the fixed preview
# Worker. Branch control is the primary cost control; this check prevents an
# accidental non-production trigger from mutating preview or production even
# if the Cloudflare dashboard configuration drifts.
if [[ "${WORKERS_CI:-}" == "1" && "$branch" != "$expected_branch" ]]; then
  echo "Skipping Cloudflare $target deploy on Workers Builds branch '${branch:-unknown}'; only '$expected_branch' is deployable."
  exit 0
fi

"${migrate_command[@]}"
"${deploy_command[@]}"
