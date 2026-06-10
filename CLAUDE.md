# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

The repository is named **ImmofeuControl**, but the application it contains is branded **Excubya** — a real-time AI incident-detection and emergency-alert system. All package names (`excubya`), env var prefixes (`EXCUBYA_`), the SQLite file (`excubya.db`), and user-facing strings use the "Excubya" name. Treat the two names as referring to the same project; do not "fix" one to match the other without being asked.

Most user-facing strings, log messages, and incident descriptions are in **French**. Match that convention when adding new descriptions or dashboard copy.

## Commands

```bash
# Install dependencies (Python 3.10+ required)
pip install -r requirements.txt

# Run the app (serves dashboard + API on :8000, reload controlled by EXCUBYA_DEBUG)
python main.py

# Run all tests
pytest tests/ -v

# Run a single test or test class
pytest tests/test_detection.py::TestDetectionEngine::test_compute_iou_full_overlap -v

# Docker
docker-compose up -d
```

There is no linter or formatter configured in the repo. `pyproject.toml` only sets up pytest (`asyncio_mode = "auto"`, so async tests need no `@pytest.mark.asyncio`).

Key endpoints when running: dashboard at `/`, map at `/map`, interactive API docs at `/docs`, health check at `/api/stats`.

## Architecture

Excubya is a single FastAPI process built around an **in-process async event bus**. Frames flow camera → detection → alerts entirely through pub/sub events rather than direct calls. Understanding the event bus is essential to understanding the system.

### Component wiring (read `src/app.py` first)

Global singleton components are instantiated at module load in `src/app.py`: `CameraManager`, `DetectionEngine`, `DetectionPipeline`, `AlertManager`, plus the `event_bus` singleton from `src/core/events.py`. The FastAPI `lifespan` handler is the real startup sequence:

1. Create runtime dirs (`logs/`, `snapshots/`, `recordings/`), init the DB, build the async session factory.
2. **Inject dependencies into the API layer** via `init_routes(...)` — see below.
3. Load the YOLO model, then `start()` the event bus, camera manager, pipeline, and alert manager (order matters: bus first so subscribers are live).
4. Load `enabled` cameras from the DB and register them with `CameraManager`.

### The event bus (`src/core/events.py`)

A singleton `EventBus` with a single `asyncio.Queue` and a background processing task. Components `subscribe(event_type, async_handler)` and `publish(Event(...))`. Wildcard subscription via `"*"` is supported. Handlers are awaited sequentially per event; an exception in one handler is logged and does not stop the others. Event types currently in use:

- `camera.frame` — emitted per captured frame by `CameraManager`; consumed by `DetectionPipeline`.
- `camera.online` / `camera.offline` / `camera.error` — camera lifecycle.
- `incident.detected` — emitted by `DetectionPipeline`; consumed by `AlertManager`.

When adding cross-component behavior, prefer publishing/subscribing to events over calling another component directly.

### Detection flow

- **`CameraManager`** (`src/cameras/manager.py`) runs one `asyncio` task per camera (`_camera_loop`). Each loop opens an OpenCV `VideoCapture` (RTSP/HTTP), targets ~30fps, stores `last_frame` on the `CameraStream`, and publishes a lightweight `camera.frame` event (the event carries only `camera_id`/metadata, **not** the frame). Reconnection uses linear backoff up to `camera_max_retries`, then marks the camera offline.
- **`DetectionPipeline`** (`src/detection/pipeline.py`) subscribes to `camera.frame`. It **rate-limits** analysis per camera to `detection_interval_ms` (default 500ms — most frames are dropped), pulls the actual frame via `camera_manager.get_frame(camera_id)`, runs `DetectionEngine.analyze_frame`, applies a per-`camera:incident_type` **cooldown** (`alert_cooldown_seconds`), saves an annotated snapshot, and publishes `incident.detected`.
- **`DetectionEngine`** (`src/detection/detector.py`) is the heuristic core. It wraps an Ultralytics YOLO model and layers hand-written rules on top of object detections: accident = vehicle bbox IoU overlap or large sudden displacement; fall = person bbox aspect-ratio/position heuristics with a "was standing" check using the previous frame's detections; fire/smoke = YOLO fire classes if present, else HSV color-ratio + temporal motion; medical emergency = person horizontal at ground level across multiple frames. Per-camera temporal state (`_previous_frames`, `_previous_detections`, `_person_positions`) lives in dicts keyed by `str(camera_id)`. **If the YOLO model fails to load, the engine falls back to an OpenCV-only stub (`_detect_with_opencv`) that returns no detections** but keeps the app running.
- **`AlertManager`** (`src/alerts/alert_manager.py`) subscribes to `incident.detected` and fans out to all configured channels concurrently (`asyncio.gather`): WebSocket (always), webhook/email/SMS only if the relevant settings are present. It holds the set of connected WebSocket clients and an in-memory `_alert_history` (capped at 1000).

### API layer (`src/api/routes.py`, `src/api/schemas.py`)

Routes use **module-level globals** (`_camera_manager`, `_alert_manager`, `_detection_pipeline`, `_session_factory`) populated by `init_routes()` at startup, rather than FastAPI dependency injection for the components. DB access uses the `get_db` async-session dependency. Pydantic schemas in `schemas.py` (with `from_attributes = True`) define request/response shapes. WebSocket endpoints: `/ws/alerts` (real-time alert push, expects `ping`/`pong` keepalive) and `/ws/camera/{id}` (MJPEG-over-WebSocket live stream at ~30fps).

### Persistence model and a key gap

DB models live in `src/core/models.py` (`Camera`, `Incident`, `Alert`, `EmergencyContact`) using async SQLAlchemy (`aiosqlite` by default). Status/type/severity values are stored as plain strings backed by `str`-enums.

**Persistence of incidents/alerts** is owned by `AlertManager`: when it handles an `incident.detected` event it first writes an `Incident` row (`_persist_incident`), then writes one `Alert` row per delivered channel (`_persist_alerts`), linked by `incident_id`. This is why `GET /api/incidents`, `GET /api/alerts`, the dashboard incidents table, and the `incidents_today`/`incidents_total` stats populate. The DB session factory is injected at startup via `alert_manager.set_session_factory(...)` in the `lifespan` handler — if it is not set (e.g. in unit tests), persistence is skipped silently and alert delivery still works. `Camera` and `EmergencyContact` rows are written directly by the API routes.

## Configuration

All settings are defined in `config/settings.py` (`pydantic-settings`), loaded from environment with the **`EXCUBYA_` prefix** and an optional `.env` file. `.env.example` is the canonical list. Notable knobs: `detection_model` (default `yolov8n.pt`, downloaded on first run), `detection_confidence`, `detection_interval_ms`, per-type `*_detection_enabled` toggles, `alert_cooldown_seconds`, and the optional webhook/SMTP/SMS credentials that gate which alert channels activate. `main.py` overrides the port with the `PORT` env var when present (Railway/Heroku convention).

## Deployment

Containerized via `Dockerfile` (installs OpenCV system libs) and `docker-compose.yml`. `railway.toml` configures Railway to build from the Dockerfile, run `python main.py`, and health-check `/api/stats`. See `RAILWAY_DEPLOY.md` for the full Railway walkthrough, including the SQLite-volume vs. PostgreSQL (`postgresql+asyncpg://`, add `asyncpg` to requirements) tradeoff. Snapshots/recordings are written to the local filesystem — they need a persistent volume or external storage in production.

## Testing conventions

Tests (`tests/test_detection.py`) exercise the `DetectionEngine` heuristics directly. The `engine` fixture sets `e._loaded = True` to **skip real model loading**, and tests call private detection methods (`_compute_iou`, `_detect_accident`, `_detect_fall`, etc.) with synthetic `Detection` objects and blank numpy frames. Follow this pattern for new detection logic: construct frames/detections in-memory and assert on the returned `IncidentDetection` (or `None`), without loading YOLO or opening cameras.
