import os
import torch
from diffusers import StableDiffusionXLPipeline # Use the correct XL pipeline
from io import BytesIO

base_model_id = "cagliostrolab/animagine-xl-4.0"
device = "cuda" if torch.cuda.is_available() else "cpu"

print("Loading the SDXL base pipeline structure...")
pipe = StableDiffusionXLPipeline.from_pretrained( # Use the XL class
    base_model_id,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
if device == "cuda":
    pipe.enable_model_cpu_offload()

def img_inference(prompt: str, steps: int=28, guidance_scale: float=5.0, negative_prompt: str = "", width: int = 1024, height: int = 1024, seed: int=42, batch_size: int=1):
    prompts = [prompt] * batch_size
    negative_prompts = [negative_prompt] * batch_size
    numerical_seeds = [(seed)] if batch_size == 1 else [int.from_bytes(os.urandom(8), signed=False) for _ in range(batch_size)]
    seeds = [torch.Generator(device=device).manual_seed(nseed) for nseed in numerical_seeds]
    images = pipe(
        prompt=prompts, 
        negative_prompt=negative_prompts,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        generator=seeds,
    ).images
    image_bytes_list = []
    for image in images:
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_bytes_list.append(buffer.getvalue())
    return image_bytes_list, numerical_seeds