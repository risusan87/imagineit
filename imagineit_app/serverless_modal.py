
import modal

image = (
    modal.Image.debian_slim()
    .uv_pip_install([
        "diffusers[torch]==0.35.1",
        "transformers==4.56.1",
        "torch==2.8.0",
        "accelerate==1.10.1",
        "cryptography==45.0.7",
        "peft==0.17.1",
    ])
    .add_local_file(
        "imagineit_app/encryption.py",
        remote_path="/root/encryption.py",
    )
)
with image.imports():
    from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline, StableDiffusionUpscalePipeline
    import torch
volume = modal.Volume.from_name("sdxl", create_if_missing=True)
app = modal.App("imagineit", image=image)
dictionary = modal.Dict.from_name("imagineit_dict", create_if_missing=True)

@app.function(
    image = modal.Image.debian_slim().pip_install("requests"),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def download_safetensor(remote_safetensor_location: str, location: str=""):
    import os
    import requests
    if not os.path.exists("/sdxl/loras"):
        os.makedirs("/sdxl/loras")
    if not os.path.exists("/sdxl/refiners"):
        os.makedirs("/sdxl/refiners")
    if not os.path.exists("/sdxl/upscalers"):
        os.makedirs("/sdxl/upscalers")
    name = remote_safetensor_location.split("/")[-1]
    response = requests.get(remote_safetensor_location)
    with open(f'/sdxl/{location}{"/" if location else ""}{name}', 'wb') as f:
        f.write(response.content)

@app.function(
    image = modal.Image.debian_slim().run_commands("apt-get update && apt-get install -y git-lfs"),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def download_repo(remote_location: str, location: str=""):
    import os
    if not os.path.exists("/sdxl/loras"):
        os.makedirs("/sdxl/loras")
    if not os.path.exists("/sdxl/refiners"):
        os.makedirs("/sdxl/refiners")
    if not os.path.exists("/sdxl/upscalers"):
        os.makedirs("/sdxl/upscalers")
    name = remote_location.split("/")[-1]
    local_location = f"/sdxl/{location}{'/' if location else ''}{name}"
    os.system(f"git clone {remote_location} {local_location}")
    os.system(f"cd {local_location} && git lfs pull")

@app.function(
    image = modal.Image.debian_slim(),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def get_models():
    import os
    contents = os.listdir("/sdxl")
    return [model_name.split(".safetensors")[0] for model_name in contents if model_name.endswith(".safetensors")]

@app.cls(
    gpu="L40S", 
    image=image,
    enable_memory_snapshot=True,
    scaledown_window=2,
    volumes={"/sdxl": volume},
)   
class DiffusionModel:
    model_name: str = modal.parameter()
    loras: str = modal.parameter(default="[]")
    refiner: str = modal.parameter(default="{}")
    upscaler: str = modal.parameter(default="{}")

    @modal.enter()
    def setup(self):
        import os
        import json
        from encryption import P2PEncryption
        self.refiner = json.loads(self.refiner)
        self.upscaler = json.loads(self.upscaler)
        self.pipe = StableDiffusionXLPipeline.from_single_file(
            f"/sdxl/{self.model_name}.safetensors",
            torch_dtype=torch.float16,
        )
        self.pipe.to("cuda")
        if not os.path.exists("/sdxl/loras"):
            os.makedirs("/sdxl/loras")
        adapters = []
        loras = json.loads(self.loras)
        for lora in loras:
            adapters.append(lora["name"])
            self.pipe.load_lora_weights(f'/sdxl/loras/{lora["name"]}.safetensors', adapter_name=lora["name"])
        if len(adapters) > 0:
            self.pipe.set_adapters(adapters, adapter_weights=[lora["weight"] for lora in loras])
        self.cipher = P2PEncryption(is_remote=True)
    
    @modal.method()
    def generate(self, pipe_args: bytes) -> bytes:
        """
        raw data is stringified dictionary via json.dumps
        when fixed seed is desired, use "seed" with type integer instead of torch.Generator
        returning json contains PNG images encoded as base64 strings
        """
        import gc
        from io import BytesIO
        import base64
        pipe_args: dict = self.decrypt(pipe_args)
        img_iterate = pipe_args.pop("images", 1)
        if self.refiner != {}:
            pipe_args["output_type"] = "latent"
            pipe_args["denoising_end"] = self.refiner["high_noise_frac"]
        images = []
        for _ in range(img_iterate):
            images_iter = self.pipe(**pipe_args).images
            images.extend(images_iter)
        if self.refiner != {}:
            text_encoder2 = self.pipe.text_encoder_2
            text_tokenizer2 = self.pipe.tokenizer_2
            vae = self.pipe.vae
            scheduler = self.pipe.scheduler
            self.pipe = None
            gc.collect()
            with torch.no_grad():
                torch.cuda.empty_cache()
            self.pipe = StableDiffusionXLImg2ImgPipeline.from_single_file(
                f"/sdxl/refiners/{self.refiner['model_name']}.safetensors",
                text_encoder_2 = text_encoder2,
                tokenizer_2 = text_tokenizer2,
                vae = vae,
                scheduler = scheduler,
                torch_dtype = torch.float16,
            ).to("cuda")
            images = self.pipe(
                prompt = "high resolution, detailed, extensive lighting",
                negative_prompt = pipe_args["negative_prompt"],
                num_inference_steps = pipe_args["num_inference_steps"],
                image = images,
                strength = self.refiner["strength"],
                denoising_start = self.refiner["high_noise_frac"],
            ).images
        if self.upscaler != {}:
            self.pipe = None
            gc.collect()
            with torch.no_grad():
                torch.cuda.empty_cache()
            self.pipe = StableDiffusionUpscalePipeline.from_pretrained(
                f"/sdxl/upscalers/{self.upscaler['model_name']}",
                torch_dtype = torch.float16,
            )
            images = [img.resize((512, 512)) for img in images]
            self.pipe = self.pipe.to("cuda")
            images = self.pipe(
                prompt = pipe_args["prompt"],
                num_inference_steps=20,
                image = images,
            ).images
        print("Done!")
        imgs = []
        for img in images:
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            imgs.append(img_str)
        img_dict = {"img": imgs}
        img_dict = self.encrypt(img_dict)
        print("Sending...")
        return img_dict 
    
    @modal.method()
    def encryption_request(self):
        return self.cipher.encryption_request()

    @modal.method()
    def encryption_acknowledged(self, shared_secret_encrypted: bytes, varifying_key_encrypted: bytes, session_key_encrypted: bytes, nonce: bytes):
        return self.cipher.encryption_acknowledged(
            shared_secret_encrypted,
            varifying_key_encrypted,
            session_key_encrypted,
            nonce
        )

    def decrypt(self, encrypted_payload: bytes) -> dict:
        import json
        if self.cipher.cryptor is None:
            raise Exception("Secured protocol not established")
        decrypted_data = self.cipher.cryptor.decrypt(encrypted_payload).decode("utf-8")
        return json.loads(decrypted_data)
    
    def encrypt(self, raw_payload: dict) -> bytes:
        import json
        if self.cipher.cryptor is None:
            raise Exception("Secured protocol not established")
        raw_data = json.dumps(raw_payload).encode("utf-8")
        encrypted_data = self.cipher.cryptor.encrypt(raw_data)
        return encrypted_data
