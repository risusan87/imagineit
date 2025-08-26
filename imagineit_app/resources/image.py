
from io import BytesIO
from PIL import Image
import json

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from imagineit_app.imdb import read_img_v2
from imagineit_app.inference import MODEL

router = APIRouter()



@router.get("/v1/images/{identity_hash}")
def get_image(identity_hash: str, compression_level: int):
    try:
        image = read_img_v2(identity_hash)
    except Exception as e:
        return Response(content=str(e), status_code=500, media_type="text/plain")
    if image is None:
        return Response(content="Image not found", status_code=404, media_type="text/plain")
    image = Image.open(BytesIO(image))
    small_image = image.resize(
        (image.width // (2 ** compression_level), image.height // (2 ** compression_level)), 
        resample=Image.Resampling.LANCZOS
    )
    buf = BytesIO()
    small_image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")