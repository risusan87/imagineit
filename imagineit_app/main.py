import subprocess
import shlex
import os
import time
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok

app = FastAPI()

@app.get("/api/v1/status")
def read_root():
    return {"status": "active"}

@app.get("/api/v1/imagine")
def imagine(prompt: str, negative_prompt: str = "", width: int = 1024, height: int = 1024, num_inference_steps: int = 28, guidance_scale: float = 7.5, seed: int = None):
    """
    endpoint for image inference
    """

    # for now, acknowledge the request
    print(f"Received request with prompt: {prompt}")
    print(f"Negative prompt: {negative_prompt}")
    print(f"Width: {width}, Height: {height}")
    print(f"Inference steps: {num_inference_steps}, Guidance scale: {guidance_scale}")
    print(f"Seed: {seed}")

    return {
        "status": "success",
        "message": "Request received. Processing will start shortly.",
    }

def main():
    """
    Launches Caddy, Backend, and Frontend as background processes,
    then starts a single ngrok tunnel pointing to Caddy.
    """
    # --- Configuration ---
    BACKEND_PORT = 8000
    FRONTEND_DIR = "imagineit_app/static" # The directory of your Vite app

    # --- Get ngrok token from environment ---
    NGROK_TOKEN = os.environ.get('NGROK_AUTHTOKEN')
    if not NGROK_TOKEN:
        print("❌ Error: NGROK_AUTHTOKEN not found in environment.")
        sys.exit(1)
    ngrok.set_auth_token(NGROK_TOKEN)

    processes = []
    try:
        print("🚀 Starting all services...")

        # --- Step A: Start Caddy Reverse Proxy ---
        # Caddy will automatically find and use the 'Caddyfile' in the same directory.
        # Ensure the 'caddy' executable is in your system's PATH.
        # print(f"Starting Caddy reverse proxy on port {CADDY_PORT}...")
        # caddy_proc = subprocess.Popen(['./caddy', 'run'])
        # processes.append(caddy_proc)
        # time.sleep(2) # Give Caddy a moment to start

        # --- Step B: Start FastAPI Backend ---
        backend_command = f"uvicorn imagineit_app.main:app --host 127.0.0.1 --port {BACKEND_PORT}"
        backend_proc = subprocess.Popen(shlex.split(backend_command))
        processes.append(backend_proc)
        print("✅ FastAPI backend server started.")

        # --- Step C: Start Vite Frontend ---
        frontend_command = "npm run dev"
        frontend_proc = subprocess.Popen(shlex.split(frontend_command), cwd=FRONTEND_DIR)
        processes.append(frontend_proc)
        print("✅ Vite frontend server started.")
        time.sleep(5) # Give Vite a few seconds to compile

        # --- Step D: Start the single ngrok tunnel pointing to Caddy ---
        public_url = ngrok.connect(9000, "http")
        print(f"\n🎉 Your application is live!")
        print(f"🔗 Public URL: {public_url}")
        print("\nPress Ctrl+C in this terminal to stop all services.")

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
        ngrok.kill() # Kill all ngrok tunnels
        print("✅ All services have been shut down.")

if __name__ == "__main__":
    main()