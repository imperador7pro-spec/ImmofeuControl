"""
Excubya - Main application entry point.
Initializes all components and starts the FastAPI server.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import settings
from src.core.models import init_db, get_session_factory
from src.core.events import event_bus
from src.cameras.manager import CameraManager
from src.detection.detector import DetectionEngine
from src.detection.pipeline import DetectionPipeline
from src.alerts.alert_manager import AlertManager
from src.api.routes import router, init_routes

# Setup logging
logger.add(
    "logs/excubya_{time}.log",
    rotation="10 MB",
    retention="30 days",
    level="INFO",
)

# Global components
camera_manager = CameraManager()
detection_engine = DetectionEngine()
detection_pipeline = DetectionPipeline(camera_manager, detection_engine)
alert_manager = AlertManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("=" * 60)
    logger.info("  Excubya - Starting up...")
    logger.info("=" * 60)

    # Create necessary directories
    Path(settings.snapshot_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.recording_dir).mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(parents=True, exist_ok=True)

    # Initialize database
    engine = await init_db(settings.database_url)
    session_factory = get_session_factory(engine)

    # Inject dependencies into routes
    init_routes(camera_manager, alert_manager, detection_pipeline, session_factory)

    # Load AI model
    await detection_engine.load_model()

    # Start all components
    await event_bus.start()
    await camera_manager.start()
    await detection_pipeline.start()
    await alert_manager.start()

    # Load cameras from database
    async with session_factory() as session:
        from sqlalchemy import select
        from src.core.models import Camera
        result = await session.execute(select(Camera).where(Camera.enabled == True))
        cameras = result.scalars().all()
        for cam in cameras:
            await camera_manager.add_camera(
                cam.id, cam.name, cam.stream_url, cam.detection_enabled
            )
        logger.info(f"Loaded {len(cameras)} cameras from database")

    logger.info("Excubya is ready!")
    logger.info(f"Dashboard: http://{settings.host}:{settings.port}")
    logger.info(f"API Docs:  http://{settings.host}:{settings.port}/docs")

    yield

    # Shutdown
    logger.info("Excubya - Shutting down...")
    await alert_manager.stop()
    await detection_pipeline.stop()
    await camera_manager.stop()
    await event_bus.stop()
    await engine.dispose()
    logger.info("Goodbye!")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Excubya",
        description=(
            "Systeme de detection d'incidents et d'alertes d'urgence en temps reel. "
            "Utilise l'IA pour detecter les accidents, chutes, incendies et urgences medicales "
            "via des cameras autorisees, et alerte les services d'urgence instantanement."
        ),
        version=settings.app_version,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Static files and templates
    static_dir = Path(__file__).parent.parent / "static"
    templates_dir = Path(__file__).parent.parent / "templates"
    static_dir.mkdir(parents=True, exist_ok=True)
    templates_dir.mkdir(parents=True, exist_ok=True)

    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    templates = Jinja2Templates(directory=str(templates_dir))

    # Include API routes
    app.include_router(router)

    # Dashboard route
    @app.get("/", tags=["Dashboard"])
    async def dashboard(request: Request):
        return templates.TemplateResponse("dashboard.html", {"request": request})

    @app.get("/map", tags=["Dashboard"])
    async def map_view(request: Request):
        return templates.TemplateResponse("map.html", {"request": request})

    return app


# Create the app instance
app = create_app()
