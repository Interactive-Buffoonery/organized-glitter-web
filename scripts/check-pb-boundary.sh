#!/usr/bin/env bash
#
# pb-boundary guard
#
# Fails when TypeScript source files outside src/services/ import the
# raw PocketBase client `pb` from '@/lib/pocketbase'. The service layer
# is the only sanctioned place to talk to the client directly; everything
# else must go through a typed service.
#
# Notes:
# - Importing the pure helpers `getFileUrl`, `resolveFileUrl`, or
#   `getPocketBaseConfig` from '@/lib/pocketbase' is fine — they don't
#   touch client state. Only the `pb` named import is restricted.
# - Exceptions for genuinely pb-needing non-service files (dev tools,
#   migration scripts, low-level init) are allowlisted with a
#   `// pb-boundary-ignore` comment on its own line. Use sparingly.
#
# Detection strategy:
#   1. Find all .ts/.tsx files that import from '@/lib/pocketbase'
#   2. For each file outside src/services/, extract the full import block
#      (handles multiline imports) and check if `pb` is imported as a name
#   3. Also detect namespace imports (`import * as ...`)
#
# Usage:
#   pnpm lint:pb-boundary
#   bash scripts/check-pb-boundary.sh
#
# Exit codes:
#   0  no violations
#   1  violations found

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Files that import something from '@/lib/pocketbase'
mapfile -t importers < <(
  grep -rln --include='*.ts' --include='*.tsx' \
    -E "from ['\"]@/lib/pocketbase['\"]" src/ || true
)

violators=()
for file in "${importers[@]}"; do
  # Allowed: service layer
  if [[ "$file" == src/services/* ]]; then
    continue
  fi

  # Allowed: explicit opt-out via a // pb-boundary-ignore comment.
  # Must appear as a standalone comment line OR as a trailing comment on the
  # specific @/lib/pocketbase import line. A `:<reason>` description after the
  # marker is allowed (and encouraged). Rejects matches inside strings or
  # unrelated code to prevent accidental silencing of the guard.
  if grep -qE '^[[:space:]]*//[[:space:]]*pb-boundary-ignore\b' "$file" \
     || grep -qE "from[[:space:]]+['\"]@/lib/pocketbase['\"].*//[[:space:]]*pb-boundary-ignore\b" "$file"; then
    continue
  fi

  # Extract full import statements for '@/lib/pocketbase' (handles multiline).
  # Use perl to grab everything from 'import' to the line containing the from clause.
  import_block=$(perl -0777 -ne '
    while (/import\s+(.*?from\s+['\''"]@\/lib\/pocketbase['\''"])/sg) {
      print "$1\n---\n";
    }
  ' "$file")

  # Check if any import block imports `pb` as a named binding:
  #   - `import { pb }` or `import { pb, ... }` or `import { ..., pb }`
  #   - `import * as ...` (namespace — gives access to pb)
  if echo "$import_block" | grep -qE '\bpb\b'; then
    violators+=("$file")
    continue
  fi

  # Also catch namespace imports which give access to everything
  if grep -qE "import\s+\*\s+as\s+\w+\s+from\s+['\"]@/lib/pocketbase['\"]" "$file"; then
    violators+=("$file")
    continue
  fi
done

if [ "${#violators[@]}" -gt 0 ]; then
  echo "pb-boundary violation: the following files import the raw \`pb\` client"
  echo "from @/lib/pocketbase outside src/services/:"
  echo
  for f in "${violators[@]}"; do
    echo "  $f"
  done
  echo
  echo "Fix by either:"
  echo "  - moving the call into src/services/pocketbase/*.service.ts, or"
  echo "  - adding a '// pb-boundary-ignore' comment on its own line if the file"
  echo "    genuinely needs low-level pb access (dev tools, migration scripts)."
  exit 1
fi

echo "pb-boundary: ${#importers[@]} files import from @/lib/pocketbase; no raw \`pb\` client usage outside src/services/"
