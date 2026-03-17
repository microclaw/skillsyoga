#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_DIR="$ROOT_DIR"
VERSION_FILES=(
  "package.json"
  "src-tauri/Cargo.toml"
  "src-tauri/tauri.conf.json"
  "src-tauri/Cargo.lock"
)

APP_NAME="${APP_NAME:-SkillsYoga}"
APP_SLUG="${APP_SLUG:-skillsyoga}"
TAP_REPO="${TAP_REPO:-microclaw/homebrew-tap}"
TAP_DIR_DEFAULT="$ROOT_DIR/tmp/homebrew-tap"
TAP_DIR="${TAP_DIR:-$TAP_DIR_DEFAULT}"
CASK_PATH="${CASK_PATH:-Casks/${APP_SLUG}.rb}"
APP_HOMEPAGE="${APP_HOMEPAGE:-}"
APP_DESC="${APP_DESC:-A desktop skill manager for AI coding tools.}"
PACKAGE_SCRIPT="${PACKAGE_SCRIPT:-$REPO_DIR/scripts/package_macos.sh}"
DIST_DMG_PATH="${DIST_DMG_PATH:-$REPO_DIR/dist/$APP_NAME.dmg}"

SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application: Feng Zhu (YPV49M8592)}"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-${APP_SPECIFIC_PASSWORD:-}}}"

SKIP_BUMP="${SKIP_BUMP:-0}"
SKIP_NOTARIZE="${SKIP_NOTARIZE:-0}"
SKIP_CASK_UPDATE="${SKIP_CASK_UPDATE:-0}"
FORCE_CLEAN_BUILD="${FORCE_CLEAN_BUILD:-1}"

infer_release_repo() {
  local remote
  remote="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$remote" =~ ^git@github\.com:([^/]+/[^/]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]%.git}"
    return
  fi
  if [[ "$remote" =~ ^https://github\.com/([^/]+/[^/]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]%.git}"
    return
  fi
  if [[ "$remote" =~ ^ssh://git@github\.com/([^/]+/[^/]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]%.git}"
    return
  fi
}

RELEASE_REPO="${RELEASE_REPO:-$(infer_release_repo)}"
if [ -z "$RELEASE_REPO" ]; then
  echo "Unable to infer GitHub repo from origin. Set RELEASE_REPO=owner/repo." >&2
  exit 1
fi
if [ -z "$APP_HOMEPAGE" ]; then
  APP_HOMEPAGE="https://github.com/$RELEASE_REPO"
fi

read_version() {
  node -p "require('$REPO_DIR/package.json').version"
}

contains_digit_four() {
  [[ "$1" == *4* ]]
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "Working tree is not clean. Commit or stash changes before release." >&2
    exit 1
  fi
}

add_version_files() {
  git add -- \
    "package.json" \
    "src-tauri/Cargo.toml" \
    "src-tauri/tauri.conf.json" \
    "src-tauri/Cargo.lock"
}

restore_version_files() {
  git restore --source=HEAD --staged --worktree -- \
    "package.json" \
    "src-tauri/Cargo.toml" \
    "src-tauri/tauri.conf.json" \
    "src-tauri/Cargo.lock" >/dev/null 2>&1 || true
}

for cmd in bun git gh shasum node; do
  require_cmd "$cmd"
done

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [ ! -x "$PACKAGE_SCRIPT" ]; then
  echo "Missing executable package script: $PACKAGE_SCRIPT" >&2
  exit 1
fi

cd "$REPO_DIR"
ensure_clean_worktree

VERSION="$(read_version)"
TAG="v$VERSION"
DID_BUMP=0
RELEASE_DONE=0

cleanup() {
  if [ "$RELEASE_DONE" -eq 0 ] && [ "$DID_BUMP" -eq 1 ]; then
    restore_version_files
  fi
}
trap cleanup EXIT

if [ "$SKIP_BUMP" = "1" ]; then
  echo "SKIP_BUMP=1, publishing current version: $VERSION"
else
  NO_GIT=1 "$REPO_DIR/scripts/bump_version.sh" patch
  DID_BUMP=1
  VERSION="$(read_version)"
fi

TAG="v$VERSION"

if contains_digit_four "$VERSION"; then
  echo "Version $VERSION contains digit 4, bumping patch until it is clean..."
  while contains_digit_four "$VERSION"; do
    NO_GIT=1 "$REPO_DIR/scripts/bump_version.sh" patch
    DID_BUMP=1
    VERSION="$(read_version)"
  done
  echo "Adjusted version: $VERSION"
fi

TAG="v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag already exists: $TAG" >&2
  exit 1
fi

VERSION="$VERSION" \
SIGNING_IDENTITY="$SIGNING_IDENTITY" \
NOTARYTOOL_PROFILE="$NOTARYTOOL_PROFILE" \
APPLE_ID="$APPLE_ID" \
APPLE_TEAM_ID="$APPLE_TEAM_ID" \
APPLE_APP_SPECIFIC_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" \
SKIP_NOTARIZE="$SKIP_NOTARIZE" \
FORCE_CLEAN_BUILD="$FORCE_CLEAN_BUILD" \
"$PACKAGE_SCRIPT"

if [ ! -f "$DIST_DMG_PATH" ]; then
  echo "Missing packaged DMG: $DIST_DMG_PATH" >&2
  exit 1
fi

if [ "$DID_BUMP" -eq 1 ]; then
  add_version_files
  git commit -m "new version: $VERSION"
  git push origin "$(git branch --show-current)"
fi

git tag "$TAG"
git push origin "$TAG"

RELEASE_ASSETS=("$DIST_DMG_PATH")
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "${RELEASE_ASSETS[@]}" --clobber
else
  gh release create "$TAG" "${RELEASE_ASSETS[@]}" -t "$TAG" -n "$APP_NAME $TAG"
fi

if [ "$SKIP_CASK_UPDATE" != "1" ]; then
  SHA256=$(shasum -a 256 "$DIST_DMG_PATH" | awk '{print $1}')

  if [ "$TAP_DIR" = "$TAP_DIR_DEFAULT" ]; then
    rm -rf "$TAP_DIR"
    mkdir -p "$(dirname "$TAP_DIR")"
    git clone "https://github.com/$TAP_REPO.git" "$TAP_DIR"
  elif [ ! -d "$TAP_DIR/.git" ]; then
    mkdir -p "$(dirname "$TAP_DIR")"
    git clone "https://github.com/$TAP_REPO.git" "$TAP_DIR"
  fi

  cd "$TAP_DIR"
  git fetch origin
  if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    git checkout main
  fi
  git pull --rebase origin main

  mkdir -p "$(dirname "$CASK_PATH")"
  if [ ! -f "$CASK_PATH" ]; then
    cat > "$CASK_PATH" <<EOF
cask "$APP_SLUG" do
  version "$VERSION"
  sha256 "$SHA256"

  url "https://github.com/$RELEASE_REPO/releases/download/v#{version}/$APP_NAME.dmg"
  name "$APP_NAME"
  desc "$APP_DESC"
  homepage "$APP_HOMEPAGE"

  app "$APP_NAME.app"
end
EOF
  else
    sed -i '' "s/^  version \".*\"/  version \"$VERSION\"/" "$CASK_PATH"
    sed -i '' "s/^  sha256 \".*\"/  sha256 \"$SHA256\"/" "$CASK_PATH"
  fi

  git add "$CASK_PATH"
  if ! git diff --cached --quiet; then
    git commit -m "bump ${APP_SLUG} to $VERSION"
    if ! git push origin main; then
      git pull --rebase origin main
      git push origin main
    fi
  fi
fi

RELEASE_DONE=1
echo "Done. Released $TAG"
