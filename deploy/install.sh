#!/usr/bin/env bash
set -euo pipefail
release=${1:?release id required}
archive=${2:?archive path required}
seed=${3:-}
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
test "$(id -u)" = 0
test -x /opt/florrclone/runtime/bin/node
base=/opt/florrclone
target="$base/releases/$release"
test ! -e "$target"
# Only the new application's ports may be occupied on repeat deploys.
if ! systemctl is-active --quiet florrclone; then
    for port in 8088 8788; do
        if ss -Hlnpt "sport = :$port" | grep -q .; then echo "Port $port is occupied" >&2; exit 1; fi
    done
fi
# Optional: set PRESERVE_UNIT to a systemd unit name that must stay running
# across this deploy (e.g. another game on the same host).
preserve_before=
if test -n "${PRESERVE_UNIT:-}"; then
    preserve_before=$(systemctl show "$PRESERVE_UNIT" -p MainPID --value)
fi
install -d -m 0755 "$base/releases" "$target"
tar -xzf "$archive" -C "$target"
test -f "$target/start.js"
test -f "$target/web/index.html"
test -f "$target/server/accounts.js"
/opt/florrclone/runtime/bin/node -e 'require(process.argv[1]+"/server/engine").loadEngine(process.argv[1]+"/web"); console.log("Pinned engine OK")' "$target"
if ! getent passwd florrclone >/dev/null; then
    useradd --system --user-group --home-dir /var/lib/florrclone --shell /usr/sbin/nologin florrclone
fi
install -d -m 0700 -o florrclone -g florrclone /var/lib/florrclone
if test ! -f /var/lib/florrclone/inventory.json && test -n "$seed" && test -f "$seed"; then
    install -m 0600 -o florrclone -g florrclone "$seed" /var/lib/florrclone/inventory.json
fi
# Preserve the prior release, app unit and app vhost for a narrow rollback.
install -d -m 0700 "$base/deploy-backups/$release"
backup="$base/deploy-backups/$release"
test ! -f /var/lib/florrclone/inventory.json || cp -p /var/lib/florrclone/inventory.json "$backup/inventory.json"
previous=$(readlink -f "$base/current" || true)
printf '%s\n' "$previous" > "$backup/previous-release"
test ! -f /etc/nginx/conf.d/florrclone.conf || cp -p /etc/nginx/conf.d/florrclone.conf "$backup/nginx.conf"
test ! -f /etc/systemd/system/florrclone.service || cp -p /etc/systemd/system/florrclone.service "$backup/florrclone.service"
rollback(){
    echo 'Rolling back only florrclone' >&2
    if test -n "$previous" && test -f "$previous/start.js"; then
        ln -sfn "$previous" "$base/current.rollback"; mv -Tf "$base/current.rollback" "$base/current"
    fi
    if test -f "$backup/florrclone.service"; then
        cp -p "$backup/florrclone.service" /etc/systemd/system/florrclone.service
    fi
    if test -f "$backup/nginx.conf"; then
        cp -p "$backup/nginx.conf" /etc/nginx/conf.d/florrclone.conf
    else
        rm -f /etc/nginx/conf.d/florrclone.conf
    fi
    systemctl daemon-reload
    if test -n "$previous"; then systemctl restart florrclone || true; else systemctl disable --now florrclone || true; fi
    nginx -t && systemctl reload nginx
}
trap rollback ERR
install -m 0644 "$target/deploy/florrclone.service" /etc/systemd/system/florrclone.service
install -m 0644 "$target/deploy/nginx-florrclone.conf" /etc/nginx/conf.d/florrclone.conf
nginx -t
ln -s "$target" "$base/current.next"; mv -Tf "$base/current.next" "$base/current"
systemctl daemon-reload
systemctl enable florrclone
systemctl restart florrclone
for attempt in $(seq 1 60); do
    if curl -fsS --max-time 2 http://127.0.0.1:8788/api/health >/dev/null 2>&1; then break; fi
    sleep 1
done
curl -fsS --max-time 3 http://127.0.0.1:8788/api/health
systemctl reload nginx
curl -fsS --max-time 3 http://127.0.0.1:8088/api/health
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
    ufw allow 8088/tcp comment 'florrclone online'
fi
if test -n "${PRESERVE_UNIT:-}"; then
    test "$preserve_before" = "$(systemctl show "$PRESERVE_UNIT" -p MainPID --value)"
fi
trap - ERR
printf '\nDEPLOY_OK release=%s\n' "$release"
systemctl show florrclone -p MainPID -p ActiveState -p User -p MemoryCurrent -p CPUQuotaPerSecUSec
