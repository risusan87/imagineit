
import json
from pydantic import BaseModel

from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from imagineit_app.inference import MODEL

router = APIRouter()

class InferencePayload(BaseModel):
    prompt: str
    negative_prompt: str
    width: int
    height: int
    num_inference_steps: int
    guidance_scale: float
    seed: int
    inference_size: int

@router.post("/v1/inference")
def imagine(payload: InferencePayload):
    image_hashes = []
    for _ in range(payload.inference_size):
        reference = MODEL.img_inference(
            prompt=payload.prompt,
            steps=payload.num_inference_steps,
            guidance_scale=payload.guidance_scale,
            negative_prompt=payload.negative_prompt,
            width=payload.width,
            height=payload.height,
            seed=payload.seed
        )
        image_hashes.append(reference)
    return Response(content=json.dumps(image_hashes), media_type="application/json")

@router.get("/v1/inference/{inference_ref}")
def get_inference_result(inference_ref: str):
    def stream():
        while True:
            try:
                result = MODEL.progress(inference_ref)
                if result["status"] in ["not_found", "completed"]:
                    break
            finally:
                yield f"data: {json.dumps(result)}\n\n"
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(stream(), headers=headers)