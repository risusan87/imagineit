import os
import copy

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
        self._model_loaded_event = threading.Event()

    def model_loaded(self):
        return self._model_loaded_event.is_set()
    
    def construct_status(self, status: str, result: str=None, priority: str=None) -> dict:
        return {
            "status": status,
            "result": result,
            "priority": priority
        }

    def load_model(self, loras: list[str]=[], adapter_weights: list[int]=None, cpu_inference_awareness: bool=False):
        model_name = "cagliostrolab/animagine-xl-4.0"
        if adapter_weights is not None and len(adapter_weights) != len(loras):
            print("Error with adapter_weights length.")
            print("adapter_weights is provided but mapping doesn't make sense because length between loras and adapter_weights mismatch.")
            return
        print(f"Loading model {model_name}...")
        if self.model_loaded():
            self._model_loaded_event.clear()
            print("Disposing old model...")
            self._pipes = None
            self._pipe_free_flag = None
            gc.collect()    
            with torch.no_grad():
                torch.cuda.empty_cache()
        self._pipes = []
        self._pipe_free_flag = []
        # TODO: Support other than cuda
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            print(f"Found {gpu_count} cuda GPU(s)")
            pipeline_template = StableDiffusionXLPipeline.from_pretrained(
                model_name,
                torch_dtype=torch.float16,
            )
            for dev_name in range(gpu_count):
                print(f"Loading model on GPU {dev_name}...")
                pipe = copy.deepcopy(pipeline_template)
                pipe.to(f"cuda:{dev_name}")
                self._pipes.append(pipe)
                print(f"Loaded to cuda:{dev_name}")
            del pipeline_template
        else:
            print("NO CUDA GPUs FOUND!")
            print("Loading Stable Diffusion on CPU is NOT recommended.")
            if not cpu_inference_awareness:
                print("If you are absolutely sure you want to proceed, set cpu_inference_awareness=True.")
                self._model_loaded_event.set()
                return
            pipe = StableDiffusionXLPipeline.from_pretrained(
                model_name,
                torch_dtype=torch.float32
            )
            pipe = pipe.to("cpu")
            self._pipes.append(pipe)
        for _ in range(len(self._pipes)):
            self._pipe_free_flag.append(threading.Event())
        effective_adapters = []
        effective_weights = []
        for i, lora in enumerate(loras):
            if not os.path.exists(lora):
                print(f"Warning: LORA file {lora} does not exist. Ignoring.")
                continue
            lora_name = lora.split("/")[-1].split(".")[0]
            effective_adapters.append(lora_name)
            effective_weights.append(adapter_weights[i] if adapter_weights is not None else 1.0)
            template_pipe = self._pipes[0]
            template_pipe.load_lora_weights(lora, adapter_name=lora_name)
            lora_state_dict = template_pipe.lora_state_dict(adapter_name=lora_name)
            if len(self._pipes) > 1:
                for pipe in self._pipes[1:]:
                    pipe.load_lora_weights(lora_state_dict, adapter_name=lora_name)
        if len(effective_adapters) > 0:
            for pipe in self._pipes:
                pipe.set_adapters(effective_adapters, adapter_weights=effective_weights)
        self._model_loaded_event.set()
        print("Model loaded.")

    def progress(self, reference: str):
        return self._requests.get(reference, self.construct_status(status="not_found", result=None, priority=None))
    
    def _generate(self, reference: str, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        available_pipe = -1
        print(f"number of pipe is {len(self._pipe_free_flag)}")
        while available_pipe == -1:
            time.sleep(0.1)
            for i, pipe_flag in enumerate(self._pipe_free_flag):
                if not pipe_flag.is_set():
                    pipe_flag.set()
                    available_pipe = i
                    break
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
        self._requests[reference] = self.construct_status(status="completed", result=img_hash, priority="low")

    def img_inference(self, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        reference = str(uuid4())
        print(f"Starting image inference: {reference}")
        if not self.model_loaded():
            self._requests[reference] = self.construct_status(status="model_not_loaded", result=None, priority="low")
            return reference
        # TODO: fix this
        self._requests[reference] = self.construct_status(status="queued", result=None, priority="low")
        worker = threading.Thread(target=self._generate, args=(reference, prompt, steps, guidance_scale, negative_prompt, width, height, seed))
        worker.start()
        return reference
    
MODEL = SDXLInferenceHelper()