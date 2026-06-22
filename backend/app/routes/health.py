"""Health check endpoint — no auth required."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/")
async def root() -> dict:
    return {"status": "ok", "message": "Agentic RAG API"}

