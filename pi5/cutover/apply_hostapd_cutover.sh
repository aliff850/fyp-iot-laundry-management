#!/usr/bin/env bash
set -euo pipefail

# Switch SpinSense-GW AP on wlan0 from NetworkManager wpa_supplicant AP mode
# to dedicated hostapd + dnsmasq + spinsense-ap-watchdog while preserving wlan1.
if [ "${EUID}" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_ROOT="${GATEWAY_ROOT:-/home/aliff850/edge_gateway}"
WATCHDOG_SRC="${GATEWAY_ROOT}/scripts/spinsense_ap_watchdog.py"

if [ ! -f "${WATCHDOG_SRC}" ]; then
  echo "Missing watchdog script at ${WATCHDOG_SRC}" >&2
  exit 1
fi

PSK="$(nmcli -s -g 802-11-wireless-security.psk con show Hotspot-ESP32 2>/dev/null || true)"
if [ -z "${PSK}" ]; then
  echo "Could not read existing Hotspot-ESP32 passphrase via nmcli." >&2
  read -r -s -p "Enter SpinSense-GW WPA2 passphrase: " PSK
  echo
fi
if [ "${#PSK}" -lt 8 ]; then
  echo "WPA2 passphrase must be at least 8 characters." >&2
  exit 1
fi

nmcli con down Hotspot-ESP32 >/dev/null 2>&1 || true
nmcli con modify Hotspot-ESP32 connection.autoconnect no >/dev/null 2>&1 || true

install -o root -g root -m 0644 "${SCRIPT_DIR}/98-unmanage-wlan0.conf" /etc/NetworkManager/conf.d/98-unmanage-wlan0.conf
systemctl reload NetworkManager
/usr/sbin/ip addr replace 10.42.0.1/24 dev wlan0
/usr/sbin/ip link set wlan0 up

install -d -m 0755 /etc/hostapd /etc/dnsmasq.d
install -o root -g root -m 0644 "${SCRIPT_DIR}/dnsmasq-wlan0.conf" /etc/dnsmasq.d/spinsense-wlan0.conf

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y hostapd dnsmasq

umask 077
tmp_hostapd="$(mktemp)"
python3 - "${SCRIPT_DIR}/hostapd.conf.example" "${tmp_hostapd}" "${PSK}" <<'PY'
import sys
template_path, out_path, psk = sys.argv[1], sys.argv[2], sys.argv[3]
with open(template_path, "r", encoding="utf-8") as src:
    content = src.read()
updated = content.replace("REPLACE_WITH_SPINSENSE_GW_PASSPHRASE", psk, 1)
with open(out_path, "w", encoding="utf-8") as dst:
    dst.write(updated)
PY
unset PSK
install -o root -g root -m 0600 "${tmp_hostapd}" /etc/hostapd/hostapd.conf
rm -f "${tmp_hostapd}"

if [ -f /etc/default/hostapd ]; then
  sed -i 's|^#\?DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
  if ! grep -q '^DAEMON_CONF=' /etc/default/hostapd; then
    echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' >> /etc/default/hostapd
  fi
fi

install -o root -g root -m 0644 "${SCRIPT_DIR}/spinsense-wlan0-ip.service" /etc/systemd/system/spinsense-wlan0-ip.service
install -o root -g root -m 0644 "${SCRIPT_DIR}/spinsense-ap-watchdog.service" /etc/systemd/system/spinsense-ap-watchdog.service

systemctl daemon-reload
systemctl unmask hostapd
systemctl enable --now spinsense-wlan0-ip.service
systemctl enable hostapd dnsmasq spinsense-ap-watchdog.service
systemctl restart hostapd
systemctl restart dnsmasq
systemctl restart spinsense-ap-watchdog.service

echo "Cutover complete. Verifying services..."
systemctl is-active NetworkManager spinsense-wlan0-ip.service hostapd dnsmasq spinsense-ap-watchdog.service
/usr/sbin/iw dev wlan0 info | grep -E "ssid|type|channel" || true
