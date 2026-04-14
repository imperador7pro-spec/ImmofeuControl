"""
Excubya - Detection pipeline.
Connects camera frames to the detection engine and triggers alerts.
"""

import asyncio
import json
import os
import time
from pathlib import Path

import cv2
import numpy as np
from loguru import logger

from config import settings
from src.core.events import event_bus, Event
from src.cameras.manager import CameraManager
from src.detection.detector import DetectionEngine, IncidentDetection


class DetectionPipeline:
    """
    Orchestrates the detection process:
    1. Receives frames from cameras (via event bus)
    2. Sends frames to the detection engine at configured intervals
    3. Publishes incident events when detected
    4. Saves snapshots and evidence
    """

    def __init__(self, camera_manager: CameraManager, detection_engine: DetectionEngine):
        self.camera_manager = camera_manager
        self.detection_engine = detection_engine
        self._last_analysis: dict[int, float] = {}
        self._cooldowns: dict[str, float] = {}  # camera_id:incident_type -> last_alert_time
        self._running = False
        self._stats = {
            "frames_analyzed": 0,
            "incidents_detected": 0,
            "false_alarms": 0,
        }

    @property
    def stats(self) -> dict:
        return self._stats.copy()

    async def start(self):
        """Start the detection pipeline."""
        self._running = True
        event_bus.subscribe("camera.frame", self._on_camera_frame)
        logger.info("Detection pipeline started")

    async def stop(self):
        """Stop the detection pipeline."""
        self._running = False
        event_bus.unsubscribe("camera.frame", self._on_camera_frame)
        logger.info("Detection pipeline stopped")

    async def _on_camera_frame(self, event: Event):
        """Handle a new camera frame event."""
        if not self._running:
            return

        camera_id = event.data["camera_id"]
        now = time.time()

        # Rate-limit analysis
        last = self._last_analysis.get(camera_id, 0)
        interval_s = settings.detection_interval_ms / 1000.0
        if now - last < interval_s:
            return

        self._last_analysis[camera_id] = now

        # Get the frame
        frame = self.camera_manager.get_frame(camera_id)
        if frame is None:
            return

        # Check if detection is enabled for this camera
        stream = self.camera_manager.cameras.get(camera_id)
        if stream and not stream.detection_enabled:
            return

        # Run detection
        try:
            incidents = await self.detection_engine.analyze_frame(str(camera_id), frame)
            self._stats["frames_analyzed"] += 1

            for incident in incidents:
                await self._handle_incident(camera_id, incident)

        except Exception as e:
            logger.error(f"Detection error on camera {camera_id}: {e}")

    async def _handle_incident(self, camera_id: int, incident: IncidentDetection):
        """Process a detected incident."""
        # Check cooldown
        cooldown_key = f"{camera_id}:{incident.incident_type}"
        last_alert = self._cooldowns.get(cooldown_key, 0)
        if time.time() - last_alert < settings.alert_cooldown_seconds:
            return

        self._cooldowns[cooldown_key] = time.time()
        self._stats["incidents_detected"] += 1

        # Save snapshot
        snapshot_path = await self._save_snapshot(camera_id, incident)

        # Publish incident event
        await event_bus.publish(Event(
            event_type="incident.detected",
            data={
                "camera_id": camera_id,
                "incident_type": incident.incident_type,
                "severity": incident.severity,
                "confidence": incident.confidence,
                "description": incident.description,
                "snapshot_path": snapshot_path,
                "timestamp": incident.timestamp,
                "detections": [
                    {
                        "class_name": d.class_name,
                        "confidence": d.confidence,
                        "bbox": list(d.bbox),
                    }
                    for d in incident.detections
                ],
            },
            source="detection_pipeline",
        ))

        camera_name = self.camera_manager.cameras.get(camera_id)
        cam_name = camera_name.name if camera_name else f"Camera {camera_id}"

        logger.warning(
            f"INCIDENT DETECTED | {cam_name} | "
            f"{incident.incident_type.upper()} | "
            f"Severity: {incident.severity} | "
            f"Confidence: {incident.confidence:.0%} | "
            f"{incident.description}"
        )

    async def _save_snapshot(self, camera_id: int, incident: IncidentDetection) -> str:
        """Save incident snapshot with annotations."""
        snapshot_dir = Path(settings.snapshot_dir)
        snapshot_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = time.strftime("%Y%m%d_%H%M%S", time.localtime(incident.timestamp))
        filename = f"{camera_id}_{incident.incident_type}_{timestamp_str}.jpg"
        filepath = snapshot_dir / filename

        # Draw detections on the frame
        annotated = self.detection_engine.draw_detections(
            incident.frame, incident.detections, [incident]
        )

        cv2.imwrite(str(filepath), annotated)
        logger.debug(f"Snapshot saved: {filepath}")
        return str(filepath)
