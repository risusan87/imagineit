
from beam import function, Image, Volume, Client

@function(
    gpu="RTX4090",
    image=Image(
        python_version="python3.10",
        python_packages=[
            "diffusers", 
            "transformers", 
            "torch",
            "accelerate"
        ],
    ),
)
def generate_image(request: str):
    from io import BytesIO
    import base64
    import json
    from diffusers import StableDiffusionXLPipeline
    import torch
    decoded_request = base64.b64decode(request.encode('utf-8')).decode('utf-8')
    request_data = json.loads(decoded_request)
    if "model_name" not in request_data:
        return {"error": "model_name is required."}
    pipe = StableDiffusionXLPipeline.from_pretrained(
        request_data["model_name"],
        torch_dtype=torch.float16,
    )
    pipe.to("cuda")
    images = pipe(
        prompt=request_data.get("prompt", ""),
        negative_prompt=request_data.get("negative_prompt", ""),
        num_inference_steps=request_data.get("num_inference_steps", 28),
        guidance_scale=request_data.get("guidance_scale", 7.5),
        num_images_per_prompt=8,
    ).images
    img_strs = []
    for img in images:
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        img_strs.append(img_str)
    return {"img": img_strs}