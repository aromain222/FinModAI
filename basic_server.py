#!/usr/bin/env python3
"""
Ultra-simple HTTP server for testing
This uses only Python standard library
"""

import http.server
import socketserver
import os
import sys

# Set the port (default to 8090 to avoid conflicts)
PORT = int(os.environ.get("PORT", 8090))

class SimpleHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/healthz':
            # Health check endpoint
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
        elif self.path == '/':
            # Root endpoint
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Basic Test Server</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    h1 { color: #333; }
                    .success { color: green; }
                </style>
            </head>
            <body>
                <h1>Basic Test Server is Running!</h1>
                <p class="success">✅ Connection successful</p>
                <p>This confirms that your machine can serve and access web content on port 8090.</p>
                <p>Try these links:</p>
                <ul>
                    <li><a href="/healthz">Health Check (/healthz)</a></li>
                </ul>
            </body>
            </html>
            """)
        else:
            # 404 for other paths
            self.send_response(404)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Not Found')

def main():
    """Run the server"""
    try:
        with socketserver.TCPServer(("", PORT), SimpleHandler) as httpd:
            print(f"Server running at http://localhost:{PORT}")
            print(f"Try: http://localhost:{PORT}/healthz")
            print("Press Ctrl+C to stop the server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
