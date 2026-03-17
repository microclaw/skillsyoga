#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_DIR="$ROOT_DIR"
TAURI_HOMEBREW_CONFIG="$REPO_DIR/src-tauri/tauri.conf.homebrew.json"
TMP_CONFIG="$REPO_DIR/src-tauri/tauri.conf.homebrew.generated.json"

APP_NAME="${APP_NAME:-SkillsYoga}"
VERSION="${VERSION:-$(node -p "require('$REPO_DIR/package.json').version")}"
DIST_DIR="${DIST_DIR:-$REPO_DIR/dist}"
DIST_APP_PATH="$DIST_DIR/$APP_NAME.app"
DIST_DMG_PATH="$DIST_DIR/$APP_NAME.dmg"

SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application: Feng Zhu (YPV49M8592)}"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-${APP_SPECIFIC_PASSWORD:-}}}"

SKIP_NOTARIZE="${SKIP_NOTARIZE:-0}"
FORCE_CLEAN_BUILD="${FORCE_CLEAN_BUILD:-1}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in bun cargo node xcrun; do
  require_cmd "$cmd"
done

if [ "$SKIP_NOTARIZE" != "1" ]; then
  for cmd in codesign spctl; do
    require_cmd "$cmd"
  done
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

trap 'rm -f "$TMP_CONFIG"' EXIT

echo "Running frontend build..."
bun run build

echo "Running Rust checks..."
(
  cd "$REPO_DIR/src-tauri"
  cargo check
)

cp "$TAURI_HOMEBREW_CONFIG" "$TMP_CONFIG"
if [ -n "$SIGNING_IDENTITY" ]; then
  sed -i '' "s|Developer ID Application: Feng Zhu (YPV49M8592)|$SIGNING_IDENTITY|g" "$TMP_CONFIG"
fi

if [ "$FORCE_CLEAN_BUILD" = "1" ]; then
  rm -rf "$REPO_DIR/src-tauri/target" "$DIST_APP_PATH" "$DIST_DMG_PATH"
fi

mkdir -p "$DIST_DIR"

echo "Building macOS bundle for $APP_NAME $VERSION..."
APPLE_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" bun run tauri build --config "$TMP_CONFIG"

DMG_PATH=$(ls -t "$REPO_DIR/src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}_"*.dmg 2>/dev/null | head -1 || true)
if [ -z "$DMG_PATH" ]; then
  DMG_PATH=$(ls -t "$REPO_DIR/src-tauri/target/release/bundle/dmg/"*.dmg 2>/dev/null | head -1 || true)
fi
if [ -z "$DMG_PATH" ]; then
  echo "No .dmg found at src-tauri/target/release/bundle/dmg/" >&2
  exit 1
fi

APP_PATH=$(ls -td "$REPO_DIR"/src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1 || true)
if [ -z "$APP_PATH" ]; then
  echo "No .app found at src-tauri/target/release/bundle/macos/" >&2
  exit 1
fi

rm -rf "$DIST_APP_PATH"
cp -R "$APP_PATH" "$DIST_APP_PATH"
cp -f "$DMG_PATH" "$DIST_DMG_PATH"

if [ "$SKIP_NOTARIZE" != "1" ]; then
  echo "Submitting DMG for notarization..."
  if [ -n "$NOTARYTOOL_PROFILE" ]; then
    xcrun notarytool submit "$DIST_DMG_PATH" --keychain-profile "$NOTARYTOOL_PROFILE" --wait
  else
    xcrun notarytool submit "$DIST_DMG_PATH" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
  fi

  echo "Stapling notarization ticket..."
  xcrun stapler staple "$DIST_DMG_PATH"
  xcrun stapler validate "$DIST_DMG_PATH"
  xcrun stapler staple "$DIST_APP_PATH"
  codesign --verify --deep --strict --verbose=2 "$DIST_APP_PATH"
  spctl --assess -vv "$DIST_APP_PATH"
fi

echo "App bundle: $DIST_APP_PATH"
echo "DMG: $DIST_DMG_PATH"
