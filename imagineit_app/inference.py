import torch
from diffusers import StableDiffusionXLPipeline # Use the correct XL pipeline
from io import BytesIO

base_model_id = "cagliostrolab/animagine-xl-4.0"
device = "cuda"

print("Loading the SDXL base pipeline structure...")
pipe = StableDiffusionXLPipeline.from_pretrained( # Use the XL class
    base_model_id,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
pipe.to(device)

def img_inference(prompt: str, steps: int=28, guidance_scale: float=5.0, negative_prompt: str = "", width: int = 1024, height: int = 1024, seed: int=42):
    seed_generator = torch.Generator(device=device)
    if seed is not None:
        seed_generator.manual_seed(seed)
    image = pipe(
        prompt=prompt, 
        negative_prompt=negative_prompt,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        generator=seed_generator,
    ).images[0]
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()