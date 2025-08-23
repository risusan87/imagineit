import os

import torch
from diffusers import StableDiffusionXLPipeline # Use the correct XL pipeline
from io import BytesIO
import gc
import threading
import time
from uuid import uuid4

from imagineit_app.imdb import write_v2, GLOBAL_DATABASE_THREAD_LOCK

class SDXLInferenceHelper:
    """
    "EZ" inference
    """
    
    def __init__(self):
        self._pipes: list[StableDiffusionXLPipeline] = None
        self._pipe_free_flag: list[threading.Event] = []
        self._requests = {}

    def load_model(self, loras: list[str], adapter_weights: list[int]=None):
        model_name = "cagliostrolab/animagine-xl-4.0"
        print(f"Loading model {model_name}...")
        if self._pipes is not None:
            print("Disposing old model...")
            self._pipes = None
            gc.collect()    
            with torch.no_grad():
                torch.cuda.empty_cache()
        self._pipes = []
        # TODO: Support other than cuda
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            print(f"Found {gpu_count} cuda GPU(s)")
            for dev_name in range(gpu_count):
                print(f"Loading model on GPU {dev_name}...")
                self._pipes.append(StableDiffusionXLPipeline.from_pretrained( 
                    model_name,
                    torch_dtype=torch.float16,
                ))
                self._pipe_free_flag.append(threading.Event())
                self._pipes[dev_name].to(f"cuda:{dev_name}")
        else:
            print("NO CUDA GPUs FOUND! The model will be loaded on CPU")
            print("Loading Stable Diffusion on CPU is NOT recommended, but harmless. It will take space in system RAM for a lot less efficient inference compared to GPU")
            self._pipes.append(StableDiffusionXLPipeline.from_pretrained(
                model_name,
                torch_dtype=torch.float32
            ))
            self._pipe_free_flag.append(threading.Event())
            self._pipes[0].to("cpu")
        if loras:
            for pipe in self._pipes:
                adapter_names = []
                for lora in loras:
                    lora_name = lora.split("/")[-1].split(".")[0]
                    pipe.load_lora_weights(lora, adapter_name=lora_name)
                    adapter_names.append(lora_name)
                pipe.set_adapters(adapter_names, adapter_weights=adapter_weights if adapter_weights else None)

    def progress(self, reference: str):
        return self._requests.get(reference, {"status": "not_found", "result": None, "error": "Reference not found"})
    
    def _generate(self, reference: str, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        available_pipe = -1
        while available_pipe == -1:
            time.sleep(0.1)
            for i, pipe_flag in enumerate(self._pipe_free_flag):
                if not pipe_flag.is_set():
                    pipe_flag.set()
                    available_pipe = i
                    break
        self._requests[reference]["status"] = "started"
        pipe = self._pipes[available_pipe]
        def timestep_callback(step, timestep, latents):
            self._requests[reference]["status"] = f"in_progress: ({step}/{steps})"
        image = pipe(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            seed=seed,
            callback_steps=1,
            callback=timestep_callback
        ).images[0]
        image_bytes = BytesIO()
        image.save(image_bytes, format="PNG")
        with GLOBAL_DATABASE_THREAD_LOCK:
            img_hash = write_v2(None, image_bytes.getvalue(), seed, prompt, negative_prompt, width, height, steps, guidance_scale)
        self._pipe_free_flag[available_pipe].clear()
        self._requests[reference] = {
            "status": "completed",
            "result": img_hash,
            "error": None
        }

    def img_inference(self, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        reference = str(uuid4())
        print(f"Starting image inference: {reference}")
        if self._pipes is None:
            self._requests[reference] = {
                "status": "initializing_model", 
                "result": None, 
                "error": None
            }
            self.load_model([])
        self._requests[reference] = {
            "status": "in_queue", 
            "result": None, 
            "error": None
        }
        worker = threading.Thread(target=self._generate, args=(reference, prompt, steps, guidance_scale, negative_prompt, width, height, seed))
        worker.start()
        return reference
    
MODEL = SDXLInferenceHelper()