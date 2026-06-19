#!/usr/bin/env python3
import http.server, os

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass  # silence request logs

os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.HTTPServer(('', 3742), Handler).serve_forever()
