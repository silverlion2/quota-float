#!/usr/bin/env bash
set -euo pipefail

# Exercise Apple's actual parser before spending time on a full native build.
script_dir="$(cd "$(dirname "$0")" && pwd)"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/quota float universal.XXXXXX")"
trap 'rm -rf "$fixture"' EXIT
bundle_root="$fixture/bundle"
app="$bundle_root/Fixture With Spaces.app"
binary="$app/Contents/MacOS/fixture binary"
mkdir -p "$app/Contents/MacOS" "$fixture/empty"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>fixture binary</string>
</dict></plist>
PLIST
for arch in x86_64 arm64; do
  printf 'int main(void) { return 0; }\n' |
    xcrun clang -arch "$arch" -x c -c -o "$fixture/$arch.o" -
done
lipo -create "$fixture/x86_64.o" "$fixture/arm64.o" -output "$binary"
bash "$script_dir/verify-macos-universal.sh" "$bundle_root"
for arch in x86_64 arm64; do
  cp "$fixture/$arch.o" "$binary"
  if bash "$script_dir/verify-macos-universal.sh" "$bundle_root" > /dev/null 2>&1; then
    echo "Architecture gate accepted a $arch-only binary." >&2
    exit 1
  fi
done
if bash "$script_dir/verify-macos-universal.sh" "$fixture/empty" > /dev/null 2>&1; then
  echo 'Architecture gate accepted a missing app.' >&2
  exit 1
fi
echo 'Universal architecture gate self-test passed (dual, both single-arch negatives, missing app).'
