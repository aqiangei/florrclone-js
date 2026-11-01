#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
if test -x /opt/florrclone/runtime/bin/node && [[ "$(/opt/florrclone/runtime/bin/node --version)" == v22.* ]]; then
    /opt/florrclone/runtime/bin/node --version
    exit 0
fi
work=$(mktemp -d /tmp/florrclone-runtime.XXXXXX)
trap 'rm -rf -- "$work"' EXIT
cd "$work"
curl -fLsS --connect-timeout 15 --max-time 45 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o SHASUMS256.txt
artifact=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64[.]tar[.]xz$/ { print $2 }' SHASUMS256.txt)
test -n "$artifact"
test "$(printf '%s\n' "$artifact" | wc -l)" = 1
curl -fLsS --connect-timeout 15 --max-time 180 "https://nodejs.org/dist/latest-v22.x/$artifact" -o "$artifact"
awk -v file="$artifact" '$2 == file' SHASUMS256.txt | sha256sum --check --strict -
install -d -m 0755 /opt/florrclone/runtimes
tar -xJf "$artifact" -C /opt/florrclone/runtimes
ln -s "/opt/florrclone/runtimes/${artifact%.tar.xz}" /opt/florrclone/runtime.next
mv -Tf /opt/florrclone/runtime.next /opt/florrclone/runtime
/opt/florrclone/runtime/bin/node --version
