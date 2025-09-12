
import os
import time
from io import BytesIO
from pathlib import Path
import zipfile
from PIL import Image
import json

from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

# from imagineit_app.dataio import save_img, load_img_metadata, load_img
from imagineit_app.imdb import write_v2, read_img_v2, read_metadata_v2, del_img_v2, read_mapper_v2
from imagineit_app.resources import register_resources

try:
    from imagineit_app.inference import MODEL
except Exception as e:
    print(f"Warning: Model loading failed: {e}")
    MODEL = None


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
def imagine(prompt: str, negative_prompt: str, width: int, height: int, num_inference_steps: int, guidance_scale: float, inference_size: int, seed: int=42):
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
    def retrieves(references):
        while True:
            statuses = []
            for status_ref in references:
                statuses.append(MODEL.progress(status_ref))
            if all(status['status'] == 'completed' for status in statuses):
                break
            time.sleep(0.1)
            yield f"data: {json.dumps(statuses)}\n\n"
        yield f"data: {json.dumps(statuses)}\n\n"
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", # For Nginx
    }
    return StreamingResponse(retrieves(references), headers=headers)

@app.get("/api/v1/imagine/progress/{reference}")
def imagine_progress(reference: str):
    return MODEL.progress(reference)

class LoRAPayload(BaseModel):
    loras: list[str]
    adapter_weights: list[float] = None

@app.post("/api/v1/lora-mount")
def lora_mount(lora: LoRAPayload):
    for i, lora_path in enumerate(lora.loras):
        lora_path += ".safetensors"
        if not os.path.exists(lora_path):
            return {"error": "Lora file not found."}
        lora.loras[i] = lora_path
    MODEL.load_model(lora.loras, adapter_weights=lora.adapter_weights)
    return {"status": "success"}