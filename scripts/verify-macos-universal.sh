#!/usr/bin/env bash
set -euo pipefail

bundle_root="${1:-src-tauri/target/universal-apple-darwin/release/bundle/macos}"
app_path="$(find "$bundle_root" -maxdepth 1 -type d -name '*.app' -print -quit)"
test -n "$app_path"
executable="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app_path/Contents/Info.plist")"
binary="$app_path/Contents/MacOS/$executable"
# -verify_arch consumes the remaining arguments, so the input must come first.
lipo "$binary" -verify_arch x86_64 arm64
printf 'Verified Universal executable: '
lipo "$binary" -archs
