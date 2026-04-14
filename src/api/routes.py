"""
Excubya - API routes.
"""

import io
import time
from datetime import datetime, timedelta

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from src.core.models import Camera, Incident, Alert, EmergencyContact, IncidentSeverity
from src.api.schemas import (
    CameraCreate, CameraUpdate, CameraResponse,
    IncidentResponse, IncidentUpdate,
    AlertResponse,
    EmergencyContactCreate, EmergencyContactResponse,
    SystemStats,
)

router = APIRouter()

# These will be injected by the app at startup
_camera_manager = None
_alert_manager = None
_detection_pipeline = None
_session_factory = None
_start_time = time.time()


def init_routes(camera_manager, alert_manager, detection_pipeline, session_factory):
    """Inject dependencies into routes."""
    global _camera_manager, _alert_manager, _detection_pipeline, _session_factory
    _camera_manager = camera_manager
    _alert_manager = alert_manager
    _detection_pipeline = detection_pipeline
    _session_factory = session_factory


async def get_db() -> AsyncSession:
    async with _session_factory() as session:
        yield session


# ==================== CAMERAS ====================

@router.get("/api/cameras", response_model=list[CameraResponse], tags=["Cameras"])
async def list_cameras(db: AsyncSession = Depends(get_db)):
    """List all registered cameras."""
    result = await db.execute(select(Camera).order_by(Camera.id))
    cameras = result.scalars().all()
    # Enrich with live status
    for cam in cameras:
        live_status = _camera_manager.get_status(cam.id)
        if live_status:
            cam.status = live_status
    return cameras


@router.post("/api/cameras", response_model=CameraResponse, status_code=201, tags=["Cameras"])
async def create_camera(data: CameraCreate, db: AsyncSession = Depends(get_db)):
    """Register a new camera."""
    camera = Camera(
        name=data.name,
        description=data.description,
        stream_url=data.stream_url,
        location_name=data.location_name,
        latitude=data.latitude,
        longitude=data.longitude,
        zone_type=data.zone_type,
        detection_enabled=data.detection_enabled,
    )
    db.add(camera)
    await db.commit()
    await db.refresh(camera)

    # Start the camera stream
    await _camera_manager.add_camera(
        camera.id, camera.name, camera.stream_url, camera.detection_enabled
    )

    logger.info(f"Camera created: {camera.name} (ID: {camera.id})")
    return camera


@router.get("/api/cameras/{camera_id}", response_model=CameraResponse, tags=["Cameras"])
async def get_camera(camera_id: int, db: AsyncSession = Depends(get_db)):
    """Get a camera by ID."""
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


@router.put("/api/cameras/{camera_id}", response_model=CameraResponse, tags=["Cameras"])
async def update_camera(camera_id: int, data: CameraUpdate, db: AsyncSession = Depends(get_db)):
    """Update camera configuration."""
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(camera, field, value)

    await db.commit()
    await db.refresh(camera)

    # Restart camera stream if URL changed
    if data.stream_url or data.enabled is not None:
        await _camera_manager.remove_camera(camera_id)
        if camera.enabled:
            await _camera_manager.add_camera(
                camera.id, camera.name, camera.stream_url, camera.detection_enabled
            )

    return camera


@router.delete("/api/cameras/{camera_id}", status_code=204, tags=["Cameras"])
async def delete_camera(camera_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a camera."""
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    await _camera_manager.remove_camera(camera_id)
    await db.delete(camera)
    await db.commit()


@router.get("/api/cameras/{camera_id}/snapshot", tags=["Cameras"])
async def get_camera_snapshot(camera_id: int):
    """Get the latest frame from a camera as JPEG."""
    frame = _camera_manager.get_frame(camera_id)
    if frame is None:
        raise HTTPException(status_code=404, detail="No frame available")

    _, buffer = cv2.imencode(".jpg", frame)
    return StreamingResponse(io.BytesIO(buffer.tobytes()), media_type="image/jpeg")


@router.get("/api/cameras/statuses", tags=["Cameras"])
async def get_camera_statuses():
    """Get live status of all cameras."""
    return _camera_manager.get_all_statuses()


# ==================== INCIDENTS ====================

@router.get("/api/incidents", response_model=list[IncidentResponse], tags=["Incidents"])
async def list_incidents(
    camera_id: int | None = None,
    incident_type: str | None = None,
    severity: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List incidents with optional filters."""
    query = select(Incident).order_by(Incident.detected_at.desc())

    if camera_id:
        query = query.where(Incident.camera_id == camera_id)
    if incident_type:
        query = query.where(Incident.incident_type == incident_type)
    if severity:
        query = query.where(Incident.severity == severity)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/api/incidents/{incident_id}", response_model=IncidentResponse, tags=["Incidents"])
async def get_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    """Get incident details."""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.put("/api/incidents/{incident_id}", response_model=IncidentResponse, tags=["Incidents"])
async def update_incident(incident_id: int, data: IncidentUpdate, db: AsyncSession = Depends(get_db)):
    """Update an incident (mark as resolved or false alarm)."""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(incident, field, value)

    await db.commit()
    await db.refresh(incident)
    return incident


# ==================== ALERTS ====================

@router.get("/api/alerts", response_model=list[AlertResponse], tags=["Alerts"])
async def list_alerts(
    limit: int = Query(default=50, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List recent alerts."""
    result = await db.execute(
        select(Alert).order_by(Alert.id.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("/api/alerts/{alert_id}/acknowledge", tags=["Alerts"])
async def acknowledge_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    """Acknowledge an alert."""
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.utcnow()
    if alert.sent_at:
        alert.response_time_seconds = (alert.acknowledged_at - alert.sent_at).total_seconds()

    await db.commit()
    return {"status": "acknowledged", "response_time": alert.response_time_seconds}


# ==================== EMERGENCY CONTACTS ====================

@router.get("/api/contacts", response_model=list[EmergencyContactResponse], tags=["Contacts"])
async def list_contacts(db: AsyncSession = Depends(get_db)):
    """List emergency contacts."""
    result = await db.execute(
        select(EmergencyContact).order_by(EmergencyContact.priority.desc())
    )
    return result.scalars().all()


@router.post("/api/contacts", response_model=EmergencyContactResponse, status_code=201, tags=["Contacts"])
async def create_contact(data: EmergencyContactCreate, db: AsyncSession = Depends(get_db)):
    """Add an emergency contact."""
    contact = EmergencyContact(**data.model_dump())
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


# ==================== STATS ====================

@router.get("/api/stats", response_model=SystemStats, tags=["System"])
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get system-wide statistics."""
    statuses = _camera_manager.get_all_statuses()
    online = sum(1 for s in statuses.values() if s["status"] == "online")
    error = sum(1 for s in statuses.values() if s["status"] == "error")

    total_incidents = await db.execute(select(func.count(Incident.id)))
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
    today_incidents = await db.execute(
        select(func.count(Incident.id)).where(Incident.detected_at >= today_start)
    )

    pipeline_stats = _detection_pipeline.stats

    return SystemStats(
        cameras_total=len(statuses),
        cameras_online=online,
        cameras_offline=len(statuses) - online - error,
        cameras_error=error,
        incidents_total=total_incidents.scalar() or 0,
        incidents_today=today_incidents.scalar() or 0,
        alerts_sent=len(_alert_manager.alert_history),
        frames_analyzed=pipeline_stats["frames_analyzed"],
        uptime_seconds=time.time() - _start_time,
    )


# ==================== WEBSOCKET ====================

@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket endpoint for real-time alerts."""
    await websocket.accept()
    _alert_manager.register_websocket(websocket)
    logger.info("WebSocket client connected for alerts")

    try:
        while True:
            # Keep connection alive, receive pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        _alert_manager.unregister_websocket(websocket)
        logger.info("WebSocket client disconnected")


@router.websocket("/ws/camera/{camera_id}")
async def websocket_camera_stream(websocket: WebSocket, camera_id: int):
    """WebSocket endpoint for live camera MJPEG stream."""
    await websocket.accept()
    logger.info(f"Camera stream WebSocket connected: {camera_id}")

    try:
        while True:
            frame = _camera_manager.get_frame(camera_id)
            if frame is not None:
                _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                await websocket.send_bytes(buffer.tobytes())
            await asyncio.sleep(0.033)  # ~30fps
    except WebSocketDisconnect:
        pass
    finally:
        logger.info(f"Camera stream WebSocket disconnected: {camera_id}")


import asyncio
