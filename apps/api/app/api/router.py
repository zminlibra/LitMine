from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.papers import router as papers_router
from app.api.ingest import router as ingest_router
from app.api.graph import router as graph_router
from app.api.reports import router as reports_router
from app.api.search import router as search_router
from app.api.llm_proxy import router as llm_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(projects_router)
api_router.include_router(papers_router)
api_router.include_router(ingest_router)
api_router.include_router(graph_router)
api_router.include_router(reports_router)
api_router.include_router(search_router)
api_router.include_router(llm_router)
