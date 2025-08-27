import os
import copy
import queue # Import the queue module
import threading
import time
from uuid import uuid4

import torch
from diffusers import StableDiffusionXLPipeline
from io import BytesIO
import gc

from imagineit_app.imdb import write_v2, GLOBAL_DATABASE_THREAD_LOCK

class SDXLInferenceHelper:
    """
    "EZ" inference using a producer-consumer queue for optimal GPU utilization.
    """
    
    def __init__(self):
        self._pipes: list[StableDiffusionXLPipeline] = None
        self._requests = {}
        self._model_loaded_event = threading.Event()
        self._request_queue = queue.Queue() # The central job queue

    def model_loaded(self):
        return self._model_loaded_event.is_set()
    
    def construct_status(self, status: str, result: str=None, priority: str=None) -> dict:
        return {
            "status": status,
            "result": result,
            "priority": priority
        }

    def load_model(self, loras: list[str]=[], adapter_weights: list[float]=[], cpu_inference_awareness: bool=False):
        # ... (Your model loading logic remains mostly the same) ...
        model_name = "cagliostrolab/animagine-xl-4.0"
        # ... (lora loading logic as before) ...
        pipeline_template = StableDiffusionXLPipeline.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        # ... (lora application logic as before) ...

        self._pipes = []
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
            # ... (CPU loading logic as before) ...
            pass
        
        # --- KEY CHANGE: Start long-lived worker threads ---
        for i in range(len(self._pipes)):
            worker = threading.Thread(target=self._worker_loop, args=(i,), daemon=True)
            worker.start()
            print(f"Started worker thread for GPU {i}")

        self._model_loaded_event.set()
        print("Model loaded and workers started.")

    def _worker_loop(self, pipe_index: int):
        """The life of a worker thread. It continuously pulls from the queue."""
        pipe = self._pipes[pipe_index]
        print(f"Worker for GPU {pipe_index} is running.")
        while True:
            # queue.get() is a blocking call. The thread will sleep efficiently
            # until an item is available.
            reference, params = self._request_queue.get()
            
            try:
                print(f"GPU {pipe_index}: Processing job {reference}")
                self._generate(pipe, reference, **params)
            except Exception as e:
                print(f"Error processing job {reference} on GPU {pipe_index}: {e}")
                self._requests[reference] = self.construct_status(status="error", result=str(e))
            finally:
                # This is important for queue management
                self._request_queue.task_done()

    def _generate(self, pipe: StableDiffusionXLPipeline, reference: str, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        """This function now only does the work, no locking."""
        
        def timestep_callback(step, timestep, latents):
            self._requests[reference]["status"] = f"in_progress: ({step}/{steps})"

        # --- GPU-bound work ---
        image = pipe(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            generator=torch.Generator(device=pipe.device).manual_seed(seed), # More robust seeding
            callback_steps=1,
            callback=timestep_callback
        ).images[0]
        # --- GPU is now free, but the worker thread continues ---

        image_bytes = BytesIO()
        image.save(image_bytes, format="PNG")

        with GLOBAL_DATABASE_THREAD_LOCK:
            img_hash = write_v2(None, image_bytes.getvalue(), seed, prompt, negative_prompt, width, height, steps, guidance_scale)
        
        self._requests[reference] = self.construct_status(status="completed", result=img_hash, priority="low")
        print(f"Completed job {reference}")

    def img_inference(self, prompt: str, steps: int, guidance_scale: float, negative_prompt: str, width: int, height: int, seed: int):
        """This is now a non-blocking producer. It just adds to the queue."""
        reference = str(uuid4())
        print(f"Queueing image inference: {reference}")

        if not self.model_loaded():
            self._requests[reference] = self.construct_status(status="model_not_loaded", result=None)
            return reference
        
        # Package the job's parameters
        params = {
            "prompt": prompt,
            "steps": steps,
            "guidance_scale": guidance_scale,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "seed": seed,
        }

        self._requests[reference] = self.construct_status(status="queued", result=None)
        self._request_queue.put((reference, params)) # Add job to the queue
        
        return reference

    def progress(self, reference: str):
        return self._requests.get(reference, self.construct_status(status="not_found"))

MODEL = SDXLInferenceHelper()