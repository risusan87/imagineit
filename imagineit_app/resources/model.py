
from pydantic import BaseModel
import threading
import queue
import json
import time

from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from imagineit_app.inference import MODEL

router = APIRouter()

@router.get("/v1/model/status")
def get_model_status():
    return Response(content=json.dumps(MODEL.status), media_type="application/json")

@router.get("/v1/model/loras")
def get_model_loras():
    return Response(content=json.dumps({"loras": []}), media_type="application/json")

class ModelLoadPayload(BaseModel):
    loras: list[tuple[str, float]] = []
    model_name: str
@router.post("/v1/model/")
def post_model_load(payload: ModelLoadPayload):
    loras, weights = zip(*payload.loras) if payload.loras else ([], [])
    def _streaming_content():
        load_status_queue = queue.Queue()
        def _load_model_task():
            for status in MODEL.load_model(loras=loras, adapter_weights=weights, model_name=payload.model_name):
                load_status_queue.put(f'data: {json.dumps(status)}\n\n')
            load_status_queue.put(None)
        load_worker = threading.Thread(target=_load_model_task)
        load_worker.start()
        while True:
            try:
                status_content = load_status_queue.get(timeout=10)
                if status_content is None:
                    break
                yield status_content
            except queue.Empty:
                yield ': heartbeat\n\n'
    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(content=_streaming_content(), headers=headers)