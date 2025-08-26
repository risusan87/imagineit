
from fastapi import FastAPI

from imagineit_app.resources import image, metadata, model

def register_resources(api: FastAPI):
    api.include_router(image.router, prefix="/api")
    api.include_router(metadata.router, prefix="/api")
    api.include_router(model.router, prefix="/api")