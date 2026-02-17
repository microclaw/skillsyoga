#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
PART="${1:-}"
NO_GIT="${NO_GIT:-0}"

if [ -z "$PART" ]; then
  echo "Usage: $0 <major|minor|patch>" >&2
  exit 1
fi

for cmd in node git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

VERSION_FILES=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/src-tauri/Cargo.toml"
  "$ROOT_DIR/src-tauri/tauri.conf.json"
)

read_package_version() {
  node -p "require('$ROOT_DIR/package.json').version"
}

OLD_VERSION="$(read_package_version)"

NEW_VERSION="$(
  node -e "
const part = process.argv[1];
const version = process.argv[2];
const parts = version.split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  throw new Error('Invalid semver version: ' + version);
}
if (part === 'major') {
  parts[0] += 1; parts[1] = 0; parts[2] = 0;
} else if (part === 'minor') {
  parts[1] += 1; parts[2] = 0;
} else if (part === 'patch') {
  parts[2] += 1;
} else {
  throw new Error('Unknown part: ' + part);
}
process.stdout.write(parts.join('.'));
" "$PART" "$OLD_VERSION"
)"

echo "Bumping version: $OLD_VERSION -> $NEW_VERSION"

node -e "
const fs = require('fs');
const path = '$ROOT_DIR/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

sed -i '' "s/^version = \"$OLD_VERSION\"/version = \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"
sed -i '' "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"

if [ "$NO_GIT" = "1" ]; then
  echo "NO_GIT=1, skipped commit/tag/push"
  exit 0
fi

TAG="v$NEW_VERSION"
if git -C "$ROOT_DIR" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag already exists: $TAG" >&2
  exit 1
fi

git -C "$ROOT_DIR" add "${VERSION_FILES[@]}"
git -C "$ROOT_DIR" commit -m "new version: $NEW_VERSION"
git -C "$ROOT_DIR" push
git -C "$ROOT_DIR" tag "$TAG"
git -C "$ROOT_DIR" push origin "$TAG"

echo "Done!"
