#!/bin/bash
# Подключает сервис синхронизации к уже работающему nginx и выпускает сертификат.
# Запуск: sudo bash setup_nginx.sh            (адрес определится сам)
#     или: sudo bash setup_nginx.sh 1.2.3.4   (если определился неверно)
# Существующие сайты не трогаются: создаётся отдельный файл для нового адреса.
set -e
if [ "$(id -u)" -ne 0 ]; then echo "Запустите от root: sudo bash setup_nginx.sh"; exit 1; fi
command -v nginx >/dev/null || { echo "nginx не найден"; exit 1; }
curl -fsS http://127.0.0.1:8787/health >/dev/null || { echo "Сервис синхронизации не отвечает. Сначала install.sh"; exit 1; }

IP="${1:-}"
if [ -z "$IP" ]; then IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org || true)"; fi
if ! echo "$IP" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then echo "Не удалось определить IP. Запустите так: sudo bash setup_nginx.sh 1.2.3.4"; exit 1; fi
HOST="$(echo "$IP" | tr . -).sslip.io"
echo "Адрес сервиса: https://$HOST"

if [ -d /etc/nginx/sites-available ]; then
  CONF=/etc/nginx/sites-available/self-upgrade-sync
  LINK=/etc/nginx/sites-enabled/self-upgrade-sync
else
  CONF=/etc/nginx/conf.d/self-upgrade-sync.conf
  LINK=""
fi

cat > "$CONF" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $HOST;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_read_timeout 30s;
    }
}
NGINX
if [ -n "$LINK" ]; then ln -sf "$CONF" "$LINK"; fi
nginx -t
systemctl reload nginx

if ! command -v certbot >/dev/null; then
  apt-get update
  apt-get install -y certbot python3-certbot-nginx
fi
certbot --nginx -d "$HOST" --non-interactive --agree-tos --register-unsafely-without-email --redirect
nginx -t
systemctl reload nginx

echo
echo "Проверка снаружи:"
curl -fsS "https://$HOST/health" && echo && echo "Готово. В приложении укажите адрес: https://$HOST"
