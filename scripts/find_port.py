"""Find an available port"""
import socket
import sys

def find_free_port():
    """Find a free port starting from 8080"""
    port = 8080
    while port < 9000:  # Try up to port 9000
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            port += 1
    raise RuntimeError("No available ports found between 8080 and 9000")

if __name__ == "__main__":
    try:
        port = find_free_port()
        print(port)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
