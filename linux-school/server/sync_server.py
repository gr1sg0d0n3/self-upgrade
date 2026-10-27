#!/usr/bin/env python3
"""Маленький сервер синхронизации для self-upgrade.

Хранит одну JSON-запись на устройство-пару: имя файла = SHA-256 от слова-кода,
сам код сервер не видит. Только стандартная библиотека Python 3.8+.

Запуск:  python3 sync_server.py --port 8787 --dir /var/lib/self-upgrade-sync
Адреса:  GET  /s/<64 hex>   отдать запись (404, если нет)
         POST /s/<64 hex>   сохранить запись (тело = JSON прогресса)
         GET  /health       проверка, что сервер жив
"""
import argparse, json, os, re, tempfile, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ID = re.compile(r'^/s/([0-9a-f]{64})$')
MAX_BODY = 1_500_000
HITS = {}            # ip -> список времён запросов
LOCK = threading.Lock()


def too_many(ip, limit=90, window=60):
    now = time.time()
    with LOCK:
        h = [t for t in HITS.get(ip, []) if now - t < window]
        h.append(now)
        HITS[ip] = h
        if len(HITS) > 5000:
            HITS.clear()
        return len(h) > limit


class H(BaseHTTPRequestHandler):
    server_version = 'su-sync'
    data_dir = '.'
    origin = '*'

    def log_message(self, fmt, *a):
        pass

    def ip(self):
        fwd = self.headers.get('X-Forwarded-For')
        if fwd and self.client_address[0] in ('127.0.0.1', '::1'):
            return fwd.split(',')[0].strip()
        return self.client_address[0]

    def send(self, code, body=b'', ctype='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', self.origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send(204)

    def do_GET(self):
        if self.path == '/health':
            return self.send(200, b'{"ok":true}')
        if too_many(self.ip()):
            return self.send(429, b'{"error":"slow down"}')
        m = ID.match(self.path)
        if not m:
            return self.send(404, b'{"error":"not found"}')
        path = os.path.join(self.data_dir, m.group(1) + '.json')
        if not os.path.isfile(path):
            return self.send(404, b'{"error":"not found"}')
        with open(path, 'rb') as f:
            self.send(200, f.read())

    def do_POST(self):
        if too_many(self.ip()):
            return self.send(429, b'{"error":"slow down"}')
        m = ID.match(self.path)
        if not m:
            return self.send(404, b'{"error":"not found"}')
        try:
            n = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self.send(413, b'{"error":"bad size"}')
        raw = self.rfile.read(n)
        try:
            obj = json.loads(raw.decode('utf-8'))
            if not isinstance(obj, dict) or obj.get('v') != 1 or not isinstance(obj.get('items'), dict):
                raise ValueError
        except Exception:
            return self.send(400, b'{"error":"bad json"}')
        fd, tmp = tempfile.mkstemp(dir=self.data_dir)
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
        os.replace(tmp, os.path.join(self.data_dir, m.group(1) + '.json'))
        self.send(200, b'{"ok":true}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--dir', default='/var/lib/self-upgrade-sync')
    ap.add_argument('--origin', default='*', help='разрешённый адрес сайта, например https://user.github.io')
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    H.data_dir, H.origin = a.dir, a.origin
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()


if __name__ == '__main__':
    main()
