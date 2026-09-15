#!/usr/bin/env bash
set -euo pipefail

# Migration history is append-only. Both Prisma and D1 migration files may be
# added in a PR, but previously committed SQL must not be rewritten, deleted,
# renamed, or copied into a different history entry after it may have been
# applied to an environment.
#
# Tests can set MIGRATION_DIFF_INPUT to a synthetic `git diff --name-status`
# payload. Real CI leaves it unset and compares BASE_SHA..HEAD_SHA.

normalize_path() {
  local path="$1"
  path="${path#./}"
  path="${path#smkc-score-app/}"
  printf '%s' "$path"
}

is_prisma_migration() {
  local path
  path="$(normalize_path "$1")"
  [[ "$path" =~ ^prisma/migrations/.+/migration\.sql$ ]]
}

is_d1_migration() {
  local path
  path="$(normalize_path "$1")"
  [[ "$path" =~ ^migrations/.+\.sql$ ]]
}

is_managed_migration() {
  is_prisma_migration "$1" || is_d1_migration "$1"
}

if [[ ${MIGRATION_DIFF_INPUT+x} == x ]]; then
  diff_output="$MIGRATION_DIFF_INPUT"
else
  : "${BASE_SHA:?BASE_SHA is required}"
  : "${HEAD_SHA:?HEAD_SHA is required}"
  diff_output="$(git diff --name-status --find-renames "$BASE_SHA" "$HEAD_SHA" -- prisma/migrations migrations)"
fi

prisma_added=0
d1_added=0
violations=()

while IFS=$'\t' read -r status path1 path2; do
  [[ -z "${status:-}" ]] && continue

  # Git prefixes rename/copy similarity, e.g. R100/C087. Only a plain add is
  # valid for migration history. For all other statuses, inspect both paths so
  # moves into or out of a migration directory are rejected as well.
  if [[ "$status" == "A" ]]; then
    if is_prisma_migration "$path1"; then
      ((prisma_added += 1))
    elif is_d1_migration "$path1"; then
      ((d1_added += 1))
    fi
    continue
  fi

  if is_managed_migration "$path1" || { [[ -n "${path2:-}" ]] && is_managed_migration "$path2"; }; then
    if [[ -n "${path2:-}" ]]; then
      violations+=("${status}: ${path1} -> ${path2}")
    else
      violations+=("${status}: ${path1}")
    fi
  fi
done <<< "$diff_output"

if (( ${#violations[@]} > 0 )); then
  echo "::error::Existing migration history is immutable. Add a new migration instead of modifying, deleting, renaming, or copying an existing migration file." >&2
  printf 'Rejected migration change: %s\n' "${violations[@]}" >&2
  exit 1
fi

if (( prisma_added != d1_added )); then
  echo "::error::This PR adds ${prisma_added} Prisma migration(s) but ${d1_added} D1 migration file(s); they must match 1:1." >&2
  echo "D1 (Cloudflare Workers) does not read prisma/migrations; add the equivalent SQL under smkc-score-app/migrations/." >&2
  exit 1
fi

printf 'Migration history check passed: %d Prisma addition(s), %d D1 addition(s), no existing migration rewrites.\n' "$prisma_added" "$d1_added"
