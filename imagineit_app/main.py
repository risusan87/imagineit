
import os
import re
import shlex
import subprocess
import sys
import time

import dotenv

def zrok_enable(token: str):
    subprocess.run(["zrok", "enable", token])

def zrok_disable():
    subprocess.run(["zrok", "disable"])

def zrok_share(host: str):
    process = subprocess.Popen(["zrok", "share", "public", host], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in process.stdout:
        url = re.findall(r'https://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', line)
        if len(url) > 0:
            break
    return process, url[0]

def main():
    """
    Launches Caddy, Backend, and Frontend as background processes,
    then starts a single ngrok tunnel pointing to Caddy.
    """
    # --- Configuration ---
    CADDY_PORT = 8795
    BACKEND_PORT = 8000
    FRONTEND_DIR = "imagineit_app/webui" # The directory of your Vite app

    # --- Get ngrok token from environment ---
    # NGROK_TOKEN = os.environ.get('NGROK_AUTHTOKEN')
    # if not NGROK_TOKEN:
    #     print("❌ Error: NGROK_AUTHTOKEN not found in environment.")
    #     sys.exit(1)
    # ngrok.set_auth_token(NGROK_TOKEN)

    # --- Get zrok token from environment ---
    ZROK_TOKEN = dotenv.get_key('.env', 'ZROK_AUTHTOKEN')
    if not ZROK_TOKEN:
        print("❌ Error: ZROK_AUTHTOKEN not found in environment.")
        sys.exit(1)
    zrok_enable(ZROK_TOKEN)
    

    processes = []
    try:
        print("🚀 Starting all services...")

        # --- Step A: Start Caddy Reverse Proxy ---
        # Caddy will automatically find and use the 'Caddyfile' in the same directory.
        # Ensure the 'caddy' executable is in your system's PATH.
        print(f"Starting Caddy reverse proxy on port {CADDY_PORT}...")
        caddy_proc = subprocess.Popen(['./caddy', 'run'])
        processes.append(caddy_proc)
        #time.sleep(2) # Give Caddy a moment to start

        # --- Step B: Start FastAPI Backend ---
        backend_command = f"uvicorn imagineit_app.app:app --host 127.0.0.1 --port {BACKEND_PORT}"
        backend_proc = subprocess.Popen(shlex.split(backend_command))
        processes.append(backend_proc)
        print("✅ FastAPI backend server started.")

        # --- Step C: Start Vite Frontend ---
        frontend_command = "npm run dev"
        frontend_proc = subprocess.Popen(shlex.split(frontend_command), cwd=FRONTEND_DIR)
        processes.append(frontend_proc)
        print("✅ Vite frontend server started.")

        # Zrok tunneling
        #time.sleep(5) # Wait for services to be fully up before starting tunnel
        zrok, public_url = zrok_share(f'http://localhost:{CADDY_PORT}')
        print(f"\n✅ Done! You can access web UI at: {public_url}")
        print("Press Ctrl+C in this terminal to stop all services.")

        # Keep the script running
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nSIGINT received, shutting down all services...")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
    finally:
        for proc in reversed(processes):
            print(f"Terminating process {proc.pid}...")
            proc.terminate() # Terminate all background processes
        # ngrok.kill() # Kill all ngrok tunnels
        if zrok is not None:
            zrok.terminate()
        zrok_disable()
        print("✅ All services have been shut down.")

if __name__ == "__main__":
    main()