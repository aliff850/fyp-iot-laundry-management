#!/usr/bin/env bash
set -euo pipefail

root=/home/aliff850/edge_gateway
staged="$root/staging-daily-20261113"
backup=/home/aliff850/edge_backups/machine-daily-20261113/code
units=(edge-ingestion.service edge-machine-simulator.service edge-dashboard.service)

restore() {
  echo 'Cutover failed; restoring prior application files.' >&2
  for name in simulator_core.py ingestion_worker.py machine_simulator.py; do
    install -o aliff850 -g aliff850 -m 0644 "$backup/$name" "$root/$name"
  done
  install -o aliff850 -g aliff850 -m 0644 "$backup/dashboard.py" "$root/dashboard/dashboard.py"
  install -o aliff850 -g aliff850 -m 0644 "$backup/dashboard.js" "$root/dashboard/static/dashboard.js"
  install -o aliff850 -g aliff850 -m 0644 "$backup/dashboard.css" "$root/dashboard/static/dashboard.css"
  systemctl start "${units[@]}"
}

for name in simulator_core.py ingestion_worker.py machine_simulator.py dashboard.py dashboard.js dashboard.css; do
  test -s "$staged/$name"
  test -s "$backup/$name"
done
systemctl stop "${units[@]}"
trap restore ERR
for name in simulator_core.py ingestion_worker.py machine_simulator.py; do
  install -o aliff850 -g aliff850 -m 0644 "$staged/$name" "$root/$name"
done
install -o aliff850 -g aliff850 -m 0644 "$staged/dashboard.py" "$root/dashboard/dashboard.py"
install -o aliff850 -g aliff850 -m 0644 "$staged/dashboard.js" "$root/dashboard/static/dashboard.js"
install -o aliff850 -g aliff850 -m 0644 "$staged/dashboard.css" "$root/dashboard/static/dashboard.css"
systemctl start "${units[@]}"
systemctl is-active "${units[@]}"
trap - ERR
