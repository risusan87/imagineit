import subprocess
import shlex
import time
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyngrok import ngrok


app = FastAPI()

origins = [
    "http://localhost:5173",  # Your React app's development server
    "https://www.your-production-app.com", # Your deployed frontend domain
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # Allow specific origins
    allow_credentials=True,      # Allow cookies to be sent
    allow_methods=["*"],         # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],         # Allow all headers
)

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
    # Command to run the backend (uvicorn)
    backend_command = "uvicorn imagineit_app.main:app --reload --host 127.0.0.1 --port 8000"

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
    print(f"Backend: http://127.0.0.1:8000")
    print(f"Frontend: http://localhost:5173")
    print("\nPress Ctrl+C to stop both servers.")

    try:
        # Wait for processes to complete. They won't, unless they crash.
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        # Gracefully terminate both processes
        backend_proc.terminate()
        frontend_proc.terminate()
        print("Servers have been shut down.")
        sys.exit(0)

if __name__ == "__main__":
    main()

