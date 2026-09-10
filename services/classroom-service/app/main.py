from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_classrooms import router as classrooms_router
from app.api.routes_health import router as health_router
from app.api.routes_internal import router as internal_router
from app.config import get_settings
from app.correlation import CorrelationIdMiddleware
from app.errors import register_exception_handlers
from app.logging_config import configure_logging

settings = get_settings()
configure_logging(settings.service_name)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("classroom-service iniciado", extra={"extra_fields": {"environment": settings.environment}})
    yield


app = FastAPI(title="IRIS — classroom-service", version="1.0.0", lifespan=lifespan)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health_router)
app.include_router(classrooms_router)
app.include_router(internal_router)
