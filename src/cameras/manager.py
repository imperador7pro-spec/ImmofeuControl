"""
ImmofeuControl - Camera management system.
Handles RTSP/HTTP camera connections, reconnection, and frame capture.
"""

import asyncio
import time
from typing import Optional
from dataclasses import dataclass, field

import cv2
import numpy as np
from loguru import logger

from config import settings
from src.core.events import event_bus, Event
from src.core.models import CameraStatus


@dataclass
class CameraStream:
    """Represents an active camera stream."""
    camera_id: int
    name: str
    stream_url: str
    capture: Optional[cv2.VideoCapture] = None
    status: CameraStatus = CameraStatus.OFFLINE
    last_frame: Optional[np.ndarray] = None
    last_frame_time: float = 0
    fps: float = 0
    frame_count: int = 0
    error_count: int = 0
    _task: Optional[asyncio.Task] = None
    enabled: bool = True
    detection_enabled: bool = True


class CameraManager:
    """
    Manages all camera connections and frame capture.

    Responsibilities:
    - Connect/disconnect cameras via RTSP or HTTP
    - Handle reconnection on failure
    - Provide frames to the detection engine
    - Publish camera events (online/offline/frame)
    """

    def __init__(self):
        self._cameras: dict[int, CameraStream] = {}
        self._running = False

    @property
    def cameras(self) -> dict[int, CameraStream]:
        return self._cameras

    async def add_camera(self, camera_id: int, name: str, stream_url: str,
                         detection_enabled: bool = True) -> CameraStream:
        """Add and start a camera stream."""
        if camera_id in self._cameras:
            logger.warning(f"Camera {camera_id} already exists, updating...")
            await self.remove_camera(camera_id)

        stream = CameraStream(
            camera_id=camera_id,
            name=name,
            stream_url=stream_url,
            detection_enabled=detection_enabled,
        )
        self._cameras[camera_id] = stream

        if self._running:
            stream._task = asyncio.create_task(self._camera_loop(stream))

        logger.info(f"Camera added: {name} ({stream_url})")
        return stream

    async def remove_camera(self, camera_id: int):
        """Stop and remove a camera stream."""
        stream = self._cameras.pop(camera_id, None)
        if stream:
            if stream._task:
                stream._task.cancel()
                try:
                    await stream._task
                except asyncio.CancelledError:
                    pass
            if stream.capture and stream.capture.isOpened():
                stream.capture.release()
            logger.info(f"Camera removed: {stream.name}")

    async def start(self):
        """Start all camera streams."""
        self._running = True
        for stream in self._cameras.values():
            if stream.enabled:
                stream._task = asyncio.create_task(self._camera_loop(stream))
        logger.info(f"Camera manager started with {len(self._cameras)} cameras")

    async def stop(self):
        """Stop all camera streams."""
        self._running = False
        for stream in self._cameras.values():
            if stream._task:
                stream._task.cancel()
            if stream.capture and stream.capture.isOpened():
                stream.capture.release()
        logger.info("Camera manager stopped")

    def get_frame(self, camera_id: int) -> Optional[np.ndarray]:
        """Get the latest frame from a camera."""
        stream = self._cameras.get(camera_id)
        if stream and stream.last_frame is not None:
            return stream.last_frame.copy()
        return None

    def get_status(self, camera_id: int) -> Optional[CameraStatus]:
        """Get camera status."""
        stream = self._cameras.get(camera_id)
        return stream.status if stream else None

    def get_all_statuses(self) -> dict[int, dict]:
        """Get status of all cameras."""
        return {
            cam_id: {
                "name": stream.name,
                "status": stream.status,
                "fps": stream.fps,
                "frame_count": stream.frame_count,
                "error_count": stream.error_count,
                "last_frame_time": stream.last_frame_time,
                "detection_enabled": stream.detection_enabled,
            }
            for cam_id, stream in self._cameras.items()
        }

    async def _camera_loop(self, stream: CameraStream):
        """Main loop for a single camera: connect, read frames, handle errors."""
        retries = 0

        while self._running and stream.enabled:
            try:
                # Connect
                stream.capture = cv2.VideoCapture(stream.stream_url)
                if not stream.capture.isOpened():
                    raise ConnectionError(f"Cannot open stream: {stream.stream_url}")

                stream.status = CameraStatus.ONLINE
                stream.error_count = 0
                retries = 0

                await event_bus.publish(Event(
                    event_type="camera.online",
                    data={"camera_id": stream.camera_id, "name": stream.name},
                    source="camera_manager",
                ))

                logger.info(f"Camera {stream.name} connected")
                frame_interval = 1.0 / 30  # Target ~30fps capture
                last_capture_time = 0

                # Read frames
                while self._running and stream.enabled:
                    now = time.time()
                    if now - last_capture_time < frame_interval:
                        await asyncio.sleep(0.01)
                        continue

                    ret, frame = stream.capture.read()
                    if not ret:
                        raise ConnectionError("Failed to read frame")

                    stream.last_frame = frame
                    stream.last_frame_time = now
                    stream.frame_count += 1
                    last_capture_time = now

                    # Calculate FPS
                    if stream.frame_count % 30 == 0:
                        stream.fps = 30.0 / max(now - (last_capture_time - 30 * frame_interval), 1)

                    # Publish frame event (for detection pipeline)
                    await event_bus.publish(Event(
                        event_type="camera.frame",
                        data={
                            "camera_id": stream.camera_id,
                            "timestamp": now,
                            "frame_count": stream.frame_count,
                        },
                        source="camera_manager",
                    ))

            except asyncio.CancelledError:
                break
            except Exception as e:
                stream.status = CameraStatus.ERROR
                stream.error_count += 1
                retries += 1
                logger.error(f"Camera {stream.name} error: {e}")

                await event_bus.publish(Event(
                    event_type="camera.error",
                    data={
                        "camera_id": stream.camera_id,
                        "error": str(e),
                        "retries": retries,
                    },
                    source="camera_manager",
                ))

                if retries >= settings.camera_max_retries:
                    logger.error(f"Camera {stream.name}: max retries reached, disabling")
                    stream.status = CameraStatus.OFFLINE
                    break

                delay = min(settings.camera_reconnect_delay * retries, 60)
                logger.info(f"Camera {stream.name}: reconnecting in {delay}s...")
                await asyncio.sleep(delay)

            finally:
                if stream.capture and stream.capture.isOpened():
                    stream.capture.release()

        stream.status = CameraStatus.OFFLINE
        await event_bus.publish(Event(
            event_type="camera.offline",
            data={"camera_id": stream.camera_id},
            source="camera_manager",
        ))
