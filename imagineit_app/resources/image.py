
from io import BytesIO
from PIL import Image

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from imagineit_app.imdb import read_img_v2

router = APIRouter()

class InferencePayload(BaseModel):
    prompt: str
    negative_prompt: str
    width: int
    height: int
    num_inference_steps: int
    guidance_scale: float
    seed: int
    batch_size: int
    inference_size: int

@router.get("/v1/images/{identity_hash}")
def get_image(identity_hash: str, compression_level: int):
    try:
        image = read_img_v2(identity_hash)
    except Exception as e:
        return Response(content=str(e), status_code=500, media_type="text/plain")
    if image is None:
        return Response(content="Image not found", status_code=404, media_type="text/plain")
    image = Image.open(BytesIO(image))
    small_image = image.resize(
        (image.width // (2 ** compression_level), image.height // (2 ** compression_level)), 
        resample=Image.Resampling.LANCZOS
    )
    buf = BytesIO()
    small_image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

@router.post("/v1/image/inference")
def imagine(payload: InferencePayload):
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