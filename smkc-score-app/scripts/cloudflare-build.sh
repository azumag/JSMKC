#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Workers Builds is allowed to perform the expensive OpenNext build
# only for the two long-lived deployment branches. Feature branches are covered
# by GitHub CI; building every push again in Cloudflare consumed thousands of
# paid Build Minutes without adding a distinct release gate.
#
# Cloudflare Branch control should prevent those builds from starting at all.
# This repository-side guard is defense-in-depth for dashboard configuration
# drift, using the system-provided WORKERS_CI / WORKERS_CI_BRANCH variables.
if [[ "${WORKERS_CI:-}" == "1" ]]; then
  branch="${WORKERS_CI_BRANCH:-}"
  if [[ "$branch" != "main" && "$branch" != "preview" ]]; then
    echo "Skipping OpenNext build on Workers Builds branch '${branch:-unknown}'. Only main/preview are deployable."
    exit 0
  fi
fi

exec npx opennextjs-cloudflare build
