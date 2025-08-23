import subprocess
import shlex
import os
import time
import sys
from io import BytesIO
from pathlib import Path
import zipfile
from PIL import Image

from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

# from imagineit_app.dataio import save_img, load_img_metadata, load_img
from imagineit_app.imdb import write_v2, read_img_v2, read_metadata_v2, del_img_v2, read_mapper_v2
from imagineit_app.zrok import zrok_enable, zrok_disable, zrok_share
from imagineit_app.resources import register_resources

from imagineit_app.inference import MODEL


app = FastAPI()
register_resources(app)

###
# Status
###
@app.get("/api/v1/status")
def read_root():
    return {"status": "active"}



###
# hash list
###
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



###
# Image
###
@app.get("/api/v1/{hash}/image")
def get_image_small(hash: str, level: int):
    """
    Get a small version of an image by its hash
    """
    image = read_img_v2(hash)
    if image is None:
        return {"error": "Image not found."}
    image = Image.open(BytesIO(image))
    small_image = image.resize((image.width // (2 ** level), image.height // (2 ** level)), resample=Image.Resampling.LANCZOS)
    buf = BytesIO()
    small_image.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")

@app.delete("/api/v1/{hash}/image")
def delete_image(hash: str):
    """
    Delete an image by its hash
    """
    success = del_img_v2(hash)
    if not success:
        return {"error": "Image not found."}
    return {"status": "success"}
class ImagePayload(BaseModel):
    image: str

@app.post("/api/v1/train/image")
def post_image(width: int, height: int, image: ImagePayload):
    image_bytes = bytes.fromhex(image.image)
    hash = write_v2(None, image_bytes, -1, "<train_data>", "<train_data>", width, height, -1, -1.0)
    return {"reference": hash}

@app.get("/api/v1/{hash}/prompt")
def get_prompt(hash: str):
    metadata_df = read_metadata_v2()
    if metadata_df is None:
        return {"error": "No images found."}
    prompt = metadata_df.loc[metadata_df['identity'] == hash, 'prompt']
    if prompt.empty:
        return {"error": "Prompt not found."}
    return {"prompt": prompt.iloc[0]}

@app.get("/api/v1/{hash}/label")
def get_label(hash: str):
    metadata_df = read_metadata_v2()
    if metadata_df is None:
        return {"error": "No images found."}
    label = metadata_df.loc[metadata_df['identity'] == hash, 'label']
    if label.empty:
        return {"error": "Label not found."}
    return {"label": label.iloc[0]}

@app.put("/api/v1/{hash}/label")
def update_label(hash: str, label: str):
    write_v2(hash, labeled=True, label=label)
    return {"status": "success"}

class ZipFilePayload(BaseModel):
    zip_file_name: str
    is_train_data: bool
    img_hashes: list[str]
    return_file: bool

@app.post("/api/v1/zipfile")
def create_zipfile(zip_info: ZipFilePayload):
    # Create a zip file containing the specified images
    file_structure = []
    if zip_info.is_train_data:
        metadata_df = read_metadata_v2()
        metadata_df = metadata_df[metadata_df['identity'].isin(zip_info.img_hashes)]
    for identity_hash in zip_info.img_hashes:
        image_folder = Path("images")
        img = read_img_v2(identity_hash)
        if img is None:
            continue
        if zip_info.is_train_data:
            image_folder = Path("train_data")
            if metadata_df.loc[metadata_df['identity'] == identity_hash, "labeled"].item() is False:
                continue
            text_content: str = metadata_df.loc[metadata_df['identity'] == identity_hash, "label"].item()
            file_structure.append((f"{identity_hash}.txt", BytesIO(text_content.encode('utf-8'))))
            file_structure.append((f"{identity_hash}.png", BytesIO(img)))
        else:
            file_structure.append((f"{identity_hash}.png", BytesIO(img)))
    zipped_file = BytesIO()
    with zipfile.ZipFile(zipped_file, 'w') as zipf:
        for file_name, file_data in file_structure:
            path = image_folder / file_name
            zipf.writestr(str(path), file_data.getvalue())
    return_json = {
        "status": "success",
    }
    if zip_info.return_file is True:
        return_json["file"] = zipped_file.getvalue().hex()
    else:
        with open(zip_info.zip_file_name + ".zip", 'wb') as f:
            f.write(zipped_file.getvalue())
    return return_json

@app.get("/api/v1/tags")
def get_tags():
    metadata_df = read_metadata_v2()
    if metadata_df is None:
        return {"error": "No images found."}
    all_tags = set([tag.strip() for prompt in metadata_df["prompt"].astype(str).tolist() for tag in prompt.split(',')])
    return all_tags

@app.get("/api/v1/imagine")
def imagine(prompt: str, negative_prompt: str, width: int, height: int, num_inference_steps: int, guidance_scale: float, seed: int, inference_size: int):
    """
    endpoint for image inference
    """
    references = []
    for _ in range(inference_size):
        reference = MODEL.img_inference(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=num_inference_steps,
            guidance_scale=guidance_scale,
            seed=seed if inference_size == 1 else int.from_bytes(os.urandom(8), signed=False),
        )
        references.append(reference)
    return references

@app.get("/api/v1/imagine/progress/{reference}")
def imagine_progress(reference: str):
    return MODEL.progress(reference)

@app.get("/api/v1/lora-mount")
def lora_mount(loras: list[str], adapter_weights: list[int]=None):
    for i, lora in enumerate(loras):
        lora += ".safetensors"
        if not os.path.exists(lora):
            return {"error": "Lora file not found."}
        loras[i] = lora
    MODEL.load_model(loras, adapter_weights=adapter_weights)
    return {"status": "success"}

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