#!/bin/bash
# Установка сервера синхронизации self-upgrade. Запускать от root: sudo bash install.sh
# Можно запускать повторно: скрипт ничего не ломает.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(id -u)" -ne 0 ]; then echo "Запустите от root: sudo bash install.sh"; exit 1; fi
command -v python3 >/dev/null || { echo "Нужен python3"; exit 1; }

id su-sync >/dev/null 2>&1 || useradd --system --home /var/lib/self-upgrade-sync --shell /usr/sbin/nologin su-sync
mkdir -p /opt/self-upgrade-sync /var/lib/self-upgrade-sync
cp "$DIR/sync_server.py" /opt/self-upgrade-sync/sync_server.py
chown -R su-sync:su-sync /var/lib/self-upgrade-sync

ORIGIN="${1:-*}"
cat > /etc/systemd/system/self-upgrade-sync.service <<UNIT
[Unit]
Description=self-upgrade sync server
After=network.target

[Service]
User=su-sync
ExecStart=/usr/bin/python3 /opt/self-upgrade-sync/sync_server.py --host 127.0.0.1 --port 8787 --dir /var/lib/self-upgrade-sync --origin $ORIGIN
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/self-upgrade-sync
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now self-upgrade-sync
sleep 1
if curl -fsS http://127.0.0.1:8787/health; then echo; echo "Готово: сервис работает на 127.0.0.1:8787"; else echo "Сервис не отвечает, смотрите: journalctl -u self-upgrade-sync -n 30"; exit 1; fi
