#!/bin/bash
# Re-pin the current cloudflared quick-tunnel hostname in /etc/hosts.
#
# Why: this sandbox's default resolver returns NXDOMAIN for
# *.trycloudflare.com, while the tunnel itself is live (verifiable via
# 1.1.1.1). Quick-tunnel hostnames change on every cloudflared restart,
# so any stale pins break public-URL verification. Re-run this script
# whenever the tunnel restarts (new hostname in
# .opencode-web/app-cloudflared.log) or public verification fails with
# DNS errors.
#
# Usage: scripts/pin-tunnel-dns.sh
set -euo pipefail
cd "$(dirname "$0")/.."

LOG=".opencode-web/app-cloudflared.log"
[ -f "$LOG" ] || { echo "no tunnel log at $LOG"; exit 1; }

HOSTNAME="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | tail -1 | sed 's#https://##')"
[ -n "$HOSTNAME" ] || { echo "no tunnel hostname found in $LOG"; exit 1; }
echo "tunnel hostname: $HOSTNAME"

IPS="$(nslookup "$HOSTNAME" 1.1.1.1 2>/dev/null | awk '/^Address: /{print $2}' | sort -u)"
[ -n "$IPS" ] || { echo "could not resolve $HOSTNAME via 1.1.1.1"; exit 1; }
echo "edge IPs: $(echo "$IPS" | tr '\n' ' ')"

sudo sed -i '' '/trycloudflare\.com/d' /etc/hosts 2>/dev/null \
  || sudo sed -i '/trycloudflare\.com/d' /etc/hosts
for ip in $IPS; do
  echo "$ip $HOSTNAME" | sudo tee -a /etc/hosts >/dev/null
done
echo "pinned in /etc/hosts:"
grep trycloudflare /etc/hosts

URL="https://$HOSTNAME/index.html"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL")"
echo "public check $URL -> $CODE"
[ "$CODE" = "200" ] || { echo "public URL not reachable"; exit 1; }
echo OK
