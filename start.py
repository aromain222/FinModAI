#!/usr/bin/env python3
import os
import sys

# Check what Render is giving us
render_port = os.environ.get('PORT')
print(f"Render PORT environment variable: {render_port}")

# Use assigned port if available, otherwise default to 10000
if render_port and render_port.isdigit():
    port = render_port
    print(f"Using assigned port: {port}")
else:
    port = '10000'
    print(f"Using default port: {port}")

print(f"Starting MINIMAL FinModAI on 0.0.0.0:{port}")

# Try multiple methods to start gunicorn
try:
    # Method 1: Try using python -m gunicorn
    import subprocess
    cmd = [
        sys.executable, '-m', 'gunicorn',
        '--bind', f'0.0.0.0:{port}',
        '--workers', '1', 
        '--timeout', '120',
        '--keep-alive', '5',
        '--max-requests', '100',
        '--worker-class', 'sync',
        '--log-level', 'info',
        'minimal_app:app'
    ]
    print(f"Executing: {' '.join(cmd)}")
    os.execv(sys.executable, cmd)
except Exception as e:
    print(f"Method 1 failed: {e}")
    
    # Method 2: Try direct gunicorn execution
    try:
        os.execvp('gunicorn', [
            'gunicorn',
            '--bind', f'0.0.0.0:{port}',
            '--workers', '1', 
            '--timeout', '120',
            '--keep-alive', '5',
            '--max-requests', '100',
            '--worker-class', 'sync',
            '--log-level', 'info',
            'minimal_app:app'
        ])
    except Exception as e2:
        print(f"Method 2 failed: {e2}")
        
        # Method 3: Fallback to Flask development server (not recommended for production but will work)
        print("Falling back to Flask development server...")
        from minimal_app import app
        app.run(host='0.0.0.0', port=int(port), debug=False)
