#!/usr/bin/env bash
# Installs and configures a coturn TURN server for in-app (WebRTC) calls.
#
# Run on an Ubuntu/Debian server with a public IP (can be the API server):
#   sudo bash setup-coturn.sh                       # plain TURN on 3478 (UDP+TCP)
#   sudo TURN_DOMAIN=turn.searchmydrivers.com bash setup-coturn.sh
#                                                   # + TURNS (TLS) on 5349, using an
#                                                   #   existing Let's Encrypt cert
#
# At the end it prints the TURN_* lines to put in the backend's .env.
# Re-running is safe: it keeps the existing secret unless TURN_SECRET is given.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi

CONF=/etc/turnserver.conf
SECRET_FILE=/etc/coturn-secret
TURN_DOMAIN="${TURN_DOMAIN:-}"
REALM="${TURN_REALM:-${TURN_DOMAIN:-searchmydrivers.com}}"

echo "==> Installing coturn"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y coturn curl openssl >/dev/null

PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)}"
PRIVATE_IP="$(hostname -I | awk '{print $1}')"
[[ -n "$PUBLIC_IP" ]] || { echo "Could not detect the public IP; set PUBLIC_IP=..." >&2; exit 1; }

if [[ -n "${TURN_SECRET:-}" ]]; then
  SECRET="$TURN_SECRET"
elif [[ -s "$SECRET_FILE" ]]; then
  SECRET="$(cat "$SECRET_FILE")"
else
  SECRET="$(openssl rand -hex 32)"
fi
umask 077; echo -n "$SECRET" > "$SECRET_FILE"

# Behind NAT (cloud VMs) coturn must advertise the public IP.
EXTERNAL_IP="$PUBLIC_IP"
if [[ "$PRIVATE_IP" != "$PUBLIC_IP" && -n "$PRIVATE_IP" ]]; then
  EXTERNAL_IP="$PUBLIC_IP/$PRIVATE_IP"
fi

TLS_BLOCK="no-tls
no-dtls"
if [[ -n "$TURN_DOMAIN" ]]; then
  CERT_DIR="/etc/letsencrypt/live/$TURN_DOMAIN"
  if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
    TLS_BLOCK="tls-listening-port=5349
cert=$CERT_DIR/fullchain.pem
pkey=$CERT_DIR/privkey.pem
no-dtls"
    # coturn runs as 'turnserver' and needs to read the cert.
    chgrp -R turnserver /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null || true
    chmod -R g+rX /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null || true
  else
    echo "!! No cert at $CERT_DIR — TLS disabled. Get one with:"
    echo "   sudo certbot certonly --standalone -d $TURN_DOMAIN   (then re-run this script)"
  fi
fi

echo "==> Writing $CONF"
[[ -f "$CONF" && ! -f "$CONF.orig" ]] && cp "$CONF" "$CONF.orig"
cat > "$CONF" <<EOF
# Managed by setup-coturn.sh (searchmydriver in-app calling)
listening-port=3478
external-ip=$EXTERNAL_IP
realm=$REALM
fingerprint

# Short-lived credentials minted by the backend (TURN_SECRET).
use-auth-secret
static-auth-secret=$SECRET

# Relay port range — must be open in the firewall / cloud security group.
min-port=49160
max-port=49999

$TLS_BLOCK

# Hardening: never relay into private networks or to the server itself.
no-multicast-peers
no-cli
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
user-quota=12
total-quota=1200
stale-nonce=600

log-file=/var/log/turnserver.log
simple-log
EOF

# Debian/Ubuntu packages ship coturn disabled.
[[ -f /etc/default/coturn ]] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
touch /var/log/turnserver.log && chown turnserver:turnserver /var/log/turnserver.log 2>/dev/null || true

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Opening firewall ports (ufw)"
  ufw allow 3478/tcp >/dev/null
  ufw allow 3478/udp >/dev/null
  ufw allow 49160:49999/udp >/dev/null
  [[ "$TLS_BLOCK" == tls-* ]] && ufw allow 5349/tcp >/dev/null
fi

echo "==> Starting coturn"
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn
sleep 1
systemctl is-active --quiet coturn || { journalctl -u coturn -n 30 --no-pager; exit 1; }

HOST="${TURN_DOMAIN:-$PUBLIC_IP}"
URLS="turn:$HOST:3478?transport=udp,turn:$HOST:3478?transport=tcp"
[[ "$TLS_BLOCK" == tls-* ]] && URLS="$URLS,turns:$HOST:5349?transport=tcp"

cat <<EOF

✅ coturn is running.

Add these lines to the backend .env, then restart it (pm2 restart searchmydrivers-api):

TURN_URLS=$URLS
TURN_SECRET=$SECRET

Also open these ports in your cloud provider's firewall / security group if it has one:
  3478 TCP+UDP, 49160-49999 UDP$( [[ "$TLS_BLOCK" == tls-* ]] && echo ", 5349 TCP")

Test: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
  (use a username/credential the backend generates — see deploy/coturn/README.md)
EOF
