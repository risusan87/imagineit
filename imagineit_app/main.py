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
    Launches the frontend and backend development servers in parallel.
    Handles Ctrl+C to gracefully shut down both servers.
    """

    FRONTEND_PORT = 5173
    BACKEND_PORT = 8000

    ngrok_token = os.environ.get("NGROK_AUTHTOKEN")
    if ngrok_token:
        ngrok.set_auth_token(ngrok_token)
    else:
        print("No ngrok token found. Please set the NGROK_AUTHTOKEN environment variable.")
        sys.exit(1)
    print(f"Starting ngrok tunnel for frontend on port {FRONTEND_PORT}...")
    try:
        # This creates the tunnel and returns a tunnel object
        frontend_tunnel = ngrok.connect(FRONTEND_PORT, "http")
        frontend_public_url = frontend_tunnel.public_url
        print(f"Frontend public URL: {frontend_public_url}")
    except Exception as e:
        print(f"Error starting ngrok: {e}")
        sys.exit(1)

    # Command to run the backend (uvicorn)
    backend_command = f"uvicorn imagineit_app.main:app --reload --host localhost --port {BACKEND_PORT}"

    # Command to run the frontend (npm start)
    # We need to specify the working directory for this command.
    frontend_command = "npm run dev"
    frontend_dir = "imagineit_app/static"

    print("Starting backend server...")
    # Use shlex.split to handle command-line arguments correctly
    backend_proc = subprocess.Popen(shlex.split(backend_command))

    print("Starting frontend server...")
    # Use cwd to set the working directory for the npm command
    frontend_proc = subprocess.Popen(shlex.split(frontend_command), cwd=frontend_dir)

    print("\nDevelopment servers are running.")
    print(f"Access your site at the public URL: {frontend_public_url}")
    print("\nPress Ctrl+C to stop both servers.")

    try:
        # Keep the main script alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down all services...")
        # Terminate processes in reverse order
        frontend_proc.terminate()
        backend_proc.terminate()
        ngrok.disconnect(frontend_public_url)
        print("All services have been shut down.")
        sys.exit(0)

if __name__ == "__main__":
    main()

