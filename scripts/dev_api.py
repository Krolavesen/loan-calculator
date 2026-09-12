"""Serve api/schedule.py locally so `npm run dev` has a real backend.

Vercel runs the same `handler` class in production; this only wires it to a
local HTTP server. Vite proxies /api to this port (see web/vite.config.ts).

    python scripts/dev_api.py [port]
"""
import os
import sys
from http.server import HTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))

from schedule import handler  # noqa: E402


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(('127.0.0.1', port), handler)
    print(f'Loan calculator API on http://127.0.0.1:{port}/api/schedule', flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
