
from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter()

@router.get("/v1/metadata/identity-hashes")
def get_identity_hashes(**kwargs):
    return Response(content=kwargs)