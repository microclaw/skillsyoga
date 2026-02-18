#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_DIR="$ROOT_DIR"
TAURI_HOMEBREW_CONFIG="$REPO_DIR/src-tauri/tauri.conf.homebrew.json"
TMP_CONFIG="$REPO_DIR/src-tauri/tauri.conf.homebrew.generated.json"
VERSION_FILES=("package.json" "src-tauri/Cargo.toml" "src-tauri/tauri.conf.json")

APP_NAME="${APP_NAME:-SkillsYoga}"
APP_SLUG="${APP_SLUG:-skillsyoga}"
TAP_REPO="${TAP_REPO:-everettjf/homebrew-tap}"
TAP_DIR_DEFAULT="$ROOT_DIR/../homebrew-tap"
TAP_DIR="${TAP_DIR:-$TAP_DIR_DEFAULT}"
CASK_PATH="${CASK_PATH:-Casks/${APP_SLUG}.rb}"
APP_HOMEPAGE="${APP_HOMEPAGE:-}"
APP_DESC="${APP_DESC:-A desktop skill manager for AI coding tools.}"

SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application: Feng Zhu (YPV49M8592)}"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-${APP_SPECIFIC_PASSWORD:-}}}"

SKIP_BUMP="${SKIP_BUMP:-0}"
SKIP_NOTARIZE="${SKIP_NOTARIZE:-0}"
SKIP_CASK_UPDATE="${SKIP_CASK_UPDATE:-0}"

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

for cmd in bun git gh shasum node xcrun; do
  require_cmd "$cmd"
done

if [ "$SKIP_NOTARIZE" != "1" ]; then
  for cmd in codesign spctl; do
    require_cmd "$cmd"
  done
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [ ! -f "$TAURI_HOMEBREW_CONFIG" ]; then
  echo "Missing config: $TAURI_HOMEBREW_CONFIG" >&2
  exit 1
fi

if [ "$SKIP_NOTARIZE" != "1" ] && [ -z "$NOTARYTOOL_PROFILE" ] && { [ -z "$APPLE_ID" ] || [ -z "$APPLE_TEAM_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; }; then
  cat >&2 <<EOF
Notarization credentials missing.
Set one of:
  1) NOTARYTOOL_PROFILE=<keychain-profile-name>
  2) APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD
Or skip notarization by setting:
  SKIP_NOTARIZE=1
EOF
  exit 1
fi

if [ "$SKIP_NOTARIZE" != "1" ] && [ -n "$SIGNING_IDENTITY" ]; then
  if ! security find-identity -v -p codesigning | grep -Fq "\"$SIGNING_IDENTITY\""; then
    cat >&2 <<EOF
Signing identity not available in keychain:
  $SIGNING_IDENTITY
EOF
    exit 1
  fi
fi

cd "$REPO_DIR"

if [ "$SKIP_BUMP" != "1" ] && ! git diff --quiet -- "${VERSION_FILES[@]}"; then
  echo "Version files have local changes. Commit or stash them first:" >&2
  printf '  %s\n' "${VERSION_FILES[@]}" >&2
  exit 1
fi

VERSION="$(read_version)"
TAG="v$VERSION"
DID_BUMP=0
RELEASE_DONE=0

cleanup() {
  rm -f "$TMP_CONFIG"
  if [ "$RELEASE_DONE" -eq 0 ] && [ "$DID_BUMP" -eq 1 ]; then
    git checkout -- "${VERSION_FILES[@]}" >/dev/null 2>&1 || true
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

cp "$TAURI_HOMEBREW_CONFIG" "$TMP_CONFIG"
if [ -n "$SIGNING_IDENTITY" ]; then
  sed -i '' "s|Developer ID Application: Feng Zhu (YPV49M8592)|$SIGNING_IDENTITY|g" "$TMP_CONFIG"
fi

APPLE_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" bun run tauri build --config "$TMP_CONFIG"

DMG_PATH=$(ls -t "src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_"*.dmg 2>/dev/null | head -1 || true)
if [ -z "$DMG_PATH" ]; then
  DMG_PATH=$(ls -t "src-tauri/target/release/bundle/dmg/"*.dmg 2>/dev/null | head -1 || true)
fi
if [ -z "$DMG_PATH" ]; then
  echo "No .dmg found at src-tauri/target/release/bundle/dmg/" >&2
  exit 1
fi

DMG_DIR=$(dirname "$DMG_PATH")
RELEASE_DMG_PATH="$DMG_DIR/${APP_NAME}.dmg"
if [ "$(basename "$DMG_PATH")" != "${APP_NAME}.dmg" ]; then
  cp -f "$DMG_PATH" "$RELEASE_DMG_PATH"
else
  RELEASE_DMG_PATH="$DMG_PATH"
fi

if [ "$SKIP_NOTARIZE" != "1" ]; then
  echo "Submitting DMG for notarization..."
  if [ -n "$NOTARYTOOL_PROFILE" ]; then
    xcrun notarytool submit "$RELEASE_DMG_PATH" --keychain-profile "$NOTARYTOOL_PROFILE" --wait
  else
    xcrun notarytool submit "$RELEASE_DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
  fi

  echo "Stapling notarization ticket..."
  xcrun stapler staple "$RELEASE_DMG_PATH"
  xcrun stapler validate "$RELEASE_DMG_PATH"

  APP_PATH=$(ls -td src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1 || true)
  if [ -n "$APP_PATH" ]; then
    codesign --verify --deep --strict --verbose=2 "$APP_PATH"
    spctl --assess -vv "$APP_PATH"
  fi
fi

# if [ "$DID_BUMP" -eq 1 ]; then
#   git add "${VERSION_FILES[@]}"
#   git commit -m "new version: $VERSION"
#   git push
#   git tag "$TAG"
#   git push origin "$TAG"
# fi

# RELEASE_ASSETS=("$RELEASE_DMG_PATH")
# if [ "$DMG_PATH" != "$RELEASE_DMG_PATH" ]; then
#   RELEASE_ASSETS+=("$DMG_PATH")
# fi

# if gh release view "$TAG" >/dev/null 2>&1; then
#   gh release upload "$TAG" "${RELEASE_ASSETS[@]}" --clobber
# else
#   gh release create "$TAG" "${RELEASE_ASSETS[@]}" -t "$TAG" -n "$APP_NAME $TAG"
# fi

# if [ "$SKIP_CASK_UPDATE" != "1" ]; then
#   SHA256=$(shasum -a 256 "$RELEASE_DMG_PATH" | awk '{print $1}')

#   if [ ! -d "$TAP_DIR/.git" ]; then
#     git clone "https://github.com/$TAP_REPO.git" "$TAP_DIR"
#   fi

#   cd "$TAP_DIR"
#   git fetch origin
#   if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
#     git checkout main
#   fi
#   git pull --rebase origin main

#   mkdir -p "$(dirname "$CASK_PATH")"
#   if [ ! -f "$CASK_PATH" ]; then
#     cat > "$CASK_PATH" <<EOF
# cask "$APP_SLUG" do
#   version "$VERSION"
#   sha256 "$SHA256"

#   url "https://github.com/$RELEASE_REPO/releases/download/v#{version}/$APP_NAME.dmg"
#   name "$APP_NAME"
#   desc "$APP_DESC"
#   homepage "$APP_HOMEPAGE"

#   app "$APP_NAME.app"
# end
# EOF
#   else
#     sed -i '' "s/^  version \".*\"/  version \"$VERSION\"/" "$CASK_PATH"
#     sed -i '' "s/^  sha256 \".*\"/  sha256 \"$SHA256\"/" "$CASK_PATH"
#   fi

#   git add "$CASK_PATH"
#   git commit -m "bump ${APP_SLUG} to $VERSION"
#   if ! git push origin main; then
#     git pull --rebase origin main
#     git push origin main
#   fi
# fi

git add .
git commit -m "released"
git push


RELEASE_DONE=1
echo "Done. Released $TAG"
