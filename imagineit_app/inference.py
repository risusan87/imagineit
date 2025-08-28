import os
import copy
import asyncio

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
        self._pipe_free_flag: list[asyncio.Event] = []
        self._requests_queue = asyncio.Queue()
        self._model_loaded_event = threading.Event()
        self._worker_loop_event = asyncio.Event()
        self._worker = threading.Thread(target=lambda:asyncio.run(self.worker_thread()))
        self._worker.start()
        self._inference_refs = {}
        self._inference_refs_lock = asyncio.Lock()
        self._worker_event_loop = None

    async def _generate_async(self, new_ref: str, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        available_pipe = -1
        while available_pipe == -1:
            await asyncio.sleep(0.1)
            for i, pipe_flag in enumerate(self._pipe_free_flag):
                if not pipe_flag.is_set():
                    pipe_flag.set()
                    available_pipe = i
                    break
        async def timestep_callback(step, timestep, latents):
            async with self._inference_refs_lock:
                self._inference_refs[new_ref]["status"] = f"in_progress: ({step}/{steps})"
        pipe = self._pipes[available_pipe]
        image = pipe(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            seed=seed,
            callback_steps=1,
            callback=timestep_callback,
        ).images[0]
        self._pipe_free_flag[available_pipe].clear()
        image_bytes = BytesIO()
        image.save(image_bytes, format="PNG")
        def synchronous_db_write():
            with GLOBAL_DATABASE_THREAD_LOCK:
                img_hash = write_v2(None, image_bytes.getvalue(), seed, prompt, negative_prompt, width, height, steps, guidance_scale)
            return img_hash
        img_hash = await self._worker_event_loop.run_in_executor(None, synchronous_db_write)
        async with self._inference_refs_lock:
            self._inference_refs[new_ref] = self.construct_status(status="completed", result=img_hash, priority="low")

    async def worker_thread(self):
        self._worker_event_loop = asyncio.get_event_loop()
        print("Worker thread is started.")
        while not self._worker_loop_event.is_set():
            req = await self._requests_queue.get()
            print("Received request")
            new_ref = req["new_ref"]
            async with self._inference_refs_lock:
                self._inference_refs[new_ref] = self.construct_status(status="queued", result=None, priority="low")
            asyncio.create_task(self._generate_async(**req))
    
    def img_inference_async(self, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        if not self.model_loaded():
            print("Model not loaded yet.")
            return
        ref = str(uuid4())
        req = {
            "new_ref": ref,
            "prompt": prompt,
            "steps": steps,
            "guidance_scale": guidance_scale,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "seed": seed
        }
        print("Worker event loop:", self._worker_event_loop)
        future = asyncio.run_coroutine_threadsafe(self._requests_queue.put(req), self._worker_event_loop)
        future.result()
        while ref not in self._inference_refs:
            time.sleep(0.1)
        return ref

    def model_loaded(self):
        return self._model_loaded_event.is_set()
    
    def construct_status(self, status: str, result: str=None, priority: str=None) -> dict:
        return {
            "status": status,
            "result": result,
            "priority": priority
        }

    def load_model(self, loras: list[str]=[], adapter_weights: list[int]=[], cpu_inference_awareness: bool=False):
        model_name = "cagliostrolab/animagine-xl-4.0"
        if loras is None:
            loras = []
        if adapter_weights is None:
            adapter_weights = []
        if len(adapter_weights) != len(loras):
            print("Error with adapter_weights length.")
            print("adapter_weights is provided but mapping doesn't make sense because length between loras and adapter_weights mismatch.")
            return
        self._pipes = []
        self._pipe_free_flag = []
        pipeline_template = StableDiffusionXLPipeline.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        effective_adapters = None
        effective_weights = None
        if len(loras) > 0:
            effective_adapters = []
            effective_weights = []
            for lora, weight in zip(loras, adapter_weights):
                if not os.path.exists(lora):
                    print(f"Warning: LORA file {lora} does not exist. Ignoring.")
                    continue
                adapter_name = lora.split("/")[-1].split(".")[0]
                effective_adapters.append((lora, adapter_name))
                effective_weights.append(weight)
        if effective_adapters is not None:
            for lora_path, adapter_name in effective_adapters:
                pipeline_template.load_lora_weights(lora_path, adapter_name=adapter_name)
            pipeline_template.set_adapters([adapter_name for _, adapter_name in effective_adapters], adapter_weights=effective_weights)
        # TODO: Support other than cuda
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            print(f"Found {gpu_count} cuda GPU(s)")
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
            pipe = pipeline_template.to("cpu")
            self._pipes.append(pipe)
        for _ in range(len(self._pipes)):
            self._pipe_free_flag.append(threading.Event())
        self._model_loaded_event.set()
        print("Model loaded.")

    def progress(self, reference: str):
        return self._inference_refs.get(reference, self.construct_status(status="not_found", result=None, priority=None))
    
    def _generate(self, reference: str, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        available_pipe = -1
        print(f"number of pipe is {len(self._pipe_free_flag)}")
        while available_pipe == -1:
            #time.sleep(0.1)
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