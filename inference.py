import torch
from diffusers import StableDiffusionXLPipeline # Use the correct XL pipeline

base_model_id = "cagliostrolab/animagine-xl-4.0"
device = "cpu"

print("Loading the SDXL base pipeline structure...")
pipe = StableDiffusionXLPipeline.from_pretrained( # Use the XL class
    base_model_id,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
pipe.to(device)

def _inference():
    # --- Step 5: Use the Final, Modified Pipeline ---
    prompt = "1girl, Shigure Ui, V Tuber, drooling, masterpiece, best quality, beautiful detailed eyes, anime style, cherry blossoms"
    negative_prompt = "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry"

    # Generate at the native SDXL resolution
    image = pipe(
        prompt=prompt, 
        negative_prompt=negative_prompt,
        num_inference_steps=28,
        guidance_scale=7.5,
        width=1024,
        height=1024
    ).images[0]
    image.save("animagine_xl_test.png")