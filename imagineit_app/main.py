import subprocess
import shlex
import os
import time
import sys

from fastapi import FastAPI
from fastapi.responses import Response
from pyngrok import ngrok
# from imagineit_app.dataio import save_img, load_img_metadata, load_img
from imagineit_app.imdb import write_v2, read_img_v2, read_metadata_v2
from imagineit_app.zrok import zrok_enable, zrok_disable, zrok_share

app = FastAPI()

@app.get("/api/v1/status")
def read_root():
    return {"status": "active"}

@app.get("/api/v1/imghashlist")
def get_unlabeled_image(include_filter_prompt: str=None, include_filter_negative_prompt: str=None, exclude_filter_prompt: str=None, exclude_filter_negative_prompt: str=None, labeled: bool=None):
    """
    Get a list of unlabeled images with optional filtering by prompt and negative prompt
    """
    metadata_df = read_metadata_v2()
    if metadata_df is None:
        return {"error": "No images found."}
    if include_filter_prompt:
        metadata_df = metadata_df[metadata_df['prompt'].str.split(',').apply(lambda x: any(item in x for item in include_filter_prompt.split(',')))]
    if include_filter_negative_prompt:
        metadata_df = metadata_df[metadata_df['negative_prompt'].str.split(',').apply(lambda x: any(item in x for item in include_filter_negative_prompt.split(',')))]
    if exclude_filter_prompt:
        metadata_df = metadata_df[~metadata_df['prompt'].str.split(',').apply(lambda x: any(item in x for item in exclude_filter_prompt.split(',')))]
    if exclude_filter_negative_prompt:
        metadata_df = metadata_df[~metadata_df['negative_prompt'].str.split(',').apply(lambda x: any(item in x for item in exclude_filter_negative_prompt.split(',')))]
    if labeled is not None:
        metadata_df = metadata_df[metadata_df['labeled'] == labeled]
    return metadata_df["identity"].tolist()

@app.get("/api/v1/image/{hash}")
def get_image(hash: str):
    """
    Get an image by its hash
    """
    image = read_img_v2(hash)
    print(hash)
    if image is None:
        return {"error": "Image not found."}
    return Response(content=image, media_type="image/png")

@app.get("/api/v1/imagine")
def imagine(prompt: str, negative_prompt: str = "", width: int = 1024, height: int = 1024, num_inference_steps: int = 28, guidance_scale: float = 7.5, seed: int = None, batch_size: int = 1, inference_size: int = 1):
    """
    endpoint for image inference
    """
    from imagineit_app.inference import img_inference
    image_hashes = []
    for _ in range(inference_size):
        image_bytes, seeds = img_inference(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=num_inference_steps,
            guidance_scale=guidance_scale,
            seed=seed if inference_size == 1 else int.from_bytes(os.urandom(8), signed=False),
            batch_size=batch_size,
        )
        for img, seed in zip(image_bytes, seeds):
            hash = write_v2(None, img, seed, prompt, negative_prompt, width, height, num_inference_steps, guidance_scale)
            image_hashes.append(hash)
    return image_hashes

def main():
    """
    Launches Caddy, Backend, and Frontend as background processes,
    then starts a single ngrok tunnel pointing to Caddy.
    """
    # --- Configuration ---
    CADDY_PORT = 8795
    BACKEND_PORT = 8000
    FRONTEND_DIR = "imagineit_app/static" # The directory of your Vite app

    # --- Get ngrok token from environment ---
    # NGROK_TOKEN = os.environ.get('NGROK_AUTHTOKEN')
    # if not NGROK_TOKEN:
    #     print("❌ Error: NGROK_AUTHTOKEN not found in environment.")
    #     sys.exit(1)
    # ngrok.set_auth_token(NGROK_TOKEN)

    # --- Get zrok token from environment ---
    ZROK_TOKEN = os.environ.get('ZROK_AUTHTOKEN')
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
        time.sleep(2) # Give Caddy a moment to start

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