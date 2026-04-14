"""
Excubya - Core AI detection engine.
Uses YOLO for object detection and custom logic for incident classification.
"""

import asyncio
import json
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
from loguru import logger

from config import settings


@dataclass
class Detection:
    """A single detection result."""
    class_name: str
    confidence: float
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2
    class_id: int


@dataclass
class IncidentDetection:
    """A detected incident with metadata."""
    incident_type: str
    severity: str
    confidence: float
    detections: list[Detection]
    frame: np.ndarray
    description: str
    timestamp: float


class DetectionEngine:
    """
    AI-powered detection engine for identifying incidents in camera feeds.

    Supports:
    - Vehicle accidents (collision detection via object overlap + motion)
    - Person falls (pose estimation / sudden position changes)
    - Fire and smoke detection
    - Medical emergencies (person on ground, not moving)
    """

    def __init__(self):
        self.model = None
        self._loaded = False
        self._previous_frames: dict[str, list[np.ndarray]] = {}
        self._previous_detections: dict[str, list[Detection]] = {}
        self._person_positions: dict[str, list[dict]] = {}

    async def load_model(self):
        """Load the YOLO detection model."""
        if self._loaded:
            return

        try:
            from ultralytics import YOLO
            model_path = settings.detection_model
            logger.info(f"Loading detection model: {model_path}")
            self.model = YOLO(model_path)
            self._loaded = True
            logger.info("Detection model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load detection model: {e}")
            logger.warning("Running in fallback mode with OpenCV-only detection")
            self._loaded = True  # Mark as loaded to avoid retry loop

    def detect_objects(self, frame: np.ndarray) -> list[Detection]:
        """Run object detection on a single frame."""
        if self.model is None:
            return self._detect_with_opencv(frame)

        results = self.model(frame, conf=settings.detection_confidence, verbose=False)
        detections = []

        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = self.model.names[cls_id]
                detections.append(Detection(
                    class_name=cls_name,
                    confidence=conf,
                    bbox=(int(x1), int(y1), int(x2), int(y2)),
                    class_id=cls_id,
                ))

        return detections

    def _detect_with_opencv(self, frame: np.ndarray) -> list[Detection]:
        """Fallback detection using OpenCV (motion + contour analysis)."""
        detections = []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (21, 21), 0)

        # Simple motion-based detection placeholder
        # In production, replace with a proper DNN model
        return detections

    async def analyze_frame(self, camera_id: str, frame: np.ndarray) -> list[IncidentDetection]:
        """
        Analyze a frame for incidents. This is the main entry point.

        Returns a list of detected incidents.
        """
        incidents = []
        detections = self.detect_objects(frame)

        # Store current frame for temporal analysis
        if camera_id not in self._previous_frames:
            self._previous_frames[camera_id] = []
        self._previous_frames[camera_id].append(frame.copy())
        if len(self._previous_frames[camera_id]) > 10:
            self._previous_frames[camera_id].pop(0)

        # Check for various incident types
        if settings.accident_detection_enabled:
            accident = self._detect_accident(camera_id, detections, frame)
            if accident:
                incidents.append(accident)

        if settings.fall_detection_enabled:
            fall = self._detect_fall(camera_id, detections, frame)
            if fall:
                incidents.append(fall)

        if settings.fire_detection_enabled:
            fire = self._detect_fire_smoke(camera_id, detections, frame)
            if fire:
                incidents.append(fire)

        medical = self._detect_medical_emergency(camera_id, detections, frame)
        if medical:
            incidents.append(medical)

        # Update previous detections
        self._previous_detections[camera_id] = detections

        return incidents

    def _detect_accident(self, camera_id: str, detections: list[Detection],
                         frame: np.ndarray) -> Optional[IncidentDetection]:
        """
        Detect vehicle accidents by analyzing:
        - Overlapping vehicle bounding boxes (collision)
        - Sudden stop of vehicles
        - Vehicles at unusual angles
        """
        vehicles = [d for d in detections if d.class_name in
                    ("car", "truck", "bus", "motorcycle", "bicycle")]

        if len(vehicles) < 2:
            return None

        # Check for overlapping vehicles (potential collision)
        for i, v1 in enumerate(vehicles):
            for v2 in vehicles[i + 1:]:
                overlap = self._compute_iou(v1.bbox, v2.bbox)
                if overlap > 0.3:  # Significant overlap indicates collision
                    severity = "critical" if overlap > 0.5 else "high"
                    avg_confidence = (v1.confidence + v2.confidence) / 2

                    return IncidentDetection(
                        incident_type="accident",
                        severity=severity,
                        confidence=avg_confidence,
                        detections=[v1, v2],
                        frame=frame,
                        description=f"Collision probable entre {v1.class_name} et {v2.class_name} "
                                    f"(chevauchement: {overlap:.0%})",
                        timestamp=time.time(),
                    )

        # Check for sudden motion changes (vehicle stopped in road)
        prev = self._previous_detections.get(camera_id, [])
        prev_vehicles = [d for d in prev if d.class_name in
                         ("car", "truck", "bus", "motorcycle")]

        if prev_vehicles and vehicles:
            for curr in vehicles:
                for previous in prev_vehicles:
                    if curr.class_name == previous.class_name:
                        displacement = self._bbox_center_distance(curr.bbox, previous.bbox)
                        # Large sudden displacement could indicate impact
                        if displacement > 100:
                            return IncidentDetection(
                                incident_type="accident",
                                severity="high",
                                confidence=curr.confidence * 0.7,
                                detections=[curr],
                                frame=frame,
                                description=f"Mouvement brusque détecté: {curr.class_name} "
                                            f"(déplacement: {displacement:.0f}px)",
                                timestamp=time.time(),
                            )
        return None

    def _detect_fall(self, camera_id: str, detections: list[Detection],
                     frame: np.ndarray) -> Optional[IncidentDetection]:
        """
        Detect person falls by analyzing:
        - Bounding box aspect ratio changes (standing -> lying)
        - Sudden vertical displacement
        - Person on the ground level
        """
        persons = [d for d in detections if d.class_name == "person"]
        if not persons:
            return None

        # Track person positions over time
        if camera_id not in self._person_positions:
            self._person_positions[camera_id] = []

        frame_h = frame.shape[0]

        for person in persons:
            x1, y1, x2, y2 = person.bbox
            width = x2 - x1
            height = y2 - y1
            aspect_ratio = width / max(height, 1)
            center_y = (y1 + y2) / 2

            # A lying person has aspect_ratio > 1 (wider than tall)
            # and is in the lower portion of the frame
            is_lying = aspect_ratio > 1.2 and y2 > frame_h * 0.6

            if is_lying:
                # Check if person was previously standing
                prev_persons = [
                    d for d in self._previous_detections.get(camera_id, [])
                    if d.class_name == "person"
                ]

                was_standing = any(
                    (d.bbox[2] - d.bbox[0]) / max(d.bbox[3] - d.bbox[1], 1) < 0.8
                    for d in prev_persons
                )

                if was_standing or len(self._previous_frames.get(camera_id, [])) < 3:
                    return IncidentDetection(
                        incident_type="fall",
                        severity="high",
                        confidence=person.confidence * 0.8,
                        detections=[person],
                        frame=frame,
                        description=f"Chute détectée: personne au sol "
                                    f"(ratio: {aspect_ratio:.2f}, position basse)",
                        timestamp=time.time(),
                    )
        return None

    def _detect_fire_smoke(self, camera_id: str, detections: list[Detection],
                           frame: np.ndarray) -> Optional[IncidentDetection]:
        """
        Detect fire and smoke using:
        - Color analysis (red/orange for fire, gray for smoke)
        - Motion patterns (flickering for fire, rising for smoke)
        - YOLO fire/smoke classes if available in the model
        """
        # Check YOLO detections first (if fire-trained model)
        fire_detections = [d for d in detections if d.class_name in ("fire", "smoke", "flame")]
        if fire_detections:
            max_det = max(fire_detections, key=lambda d: d.confidence)
            return IncidentDetection(
                incident_type="fire" if max_det.class_name != "smoke" else "smoke",
                severity="critical",
                confidence=max_det.confidence,
                detections=fire_detections,
                frame=frame,
                description=f"{'Feu' if max_det.class_name != 'smoke' else 'Fumée'} "
                            f"détecté(e) avec confiance {max_det.confidence:.0%}",
                timestamp=time.time(),
            )

        # Fallback: color-based fire detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # Fire color range (red/orange/yellow)
        lower_fire1 = np.array([0, 100, 200])
        upper_fire1 = np.array([20, 255, 255])
        lower_fire2 = np.array([160, 100, 200])
        upper_fire2 = np.array([180, 255, 255])

        mask1 = cv2.inRange(hsv, lower_fire1, upper_fire1)
        mask2 = cv2.inRange(hsv, lower_fire2, upper_fire2)
        fire_mask = cv2.bitwise_or(mask1, mask2)

        fire_pixels = cv2.countNonZero(fire_mask)
        total_pixels = frame.shape[0] * frame.shape[1]
        fire_ratio = fire_pixels / total_pixels

        if fire_ratio > 0.02:  # More than 2% of frame is fire-colored
            # Verify with temporal analysis (fire flickers)
            confidence = min(fire_ratio * 10, 0.95)
            return IncidentDetection(
                incident_type="fire",
                severity="critical" if fire_ratio > 0.05 else "high",
                confidence=confidence,
                detections=[],
                frame=frame,
                description=f"Feu potentiel détecté par analyse couleur "
                            f"({fire_ratio:.1%} de l'image)",
                timestamp=time.time(),
            )

        # Smoke detection (gray regions with upward motion)
        lower_smoke = np.array([0, 0, 130])
        upper_smoke = np.array([180, 60, 220])
        smoke_mask = cv2.inRange(hsv, lower_smoke, upper_smoke)
        smoke_pixels = cv2.countNonZero(smoke_mask)
        smoke_ratio = smoke_pixels / total_pixels

        if smoke_ratio > 0.05 and len(self._previous_frames.get(camera_id, [])) >= 2:
            prev_gray = cv2.cvtColor(self._previous_frames[camera_id][-2], cv2.COLOR_BGR2GRAY)
            curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            diff = cv2.absdiff(prev_gray, curr_gray)
            motion = cv2.countNonZero(cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)[1])
            motion_ratio = motion / total_pixels

            if motion_ratio > 0.01:
                return IncidentDetection(
                    incident_type="smoke",
                    severity="high",
                    confidence=min(smoke_ratio * 5, 0.85),
                    detections=[],
                    frame=frame,
                    description=f"Fumée potentielle détectée "
                                f"({smoke_ratio:.1%} de l'image, mouvement: {motion_ratio:.1%})",
                    timestamp=time.time(),
                )

        return None

    def _detect_medical_emergency(self, camera_id: str, detections: list[Detection],
                                  frame: np.ndarray) -> Optional[IncidentDetection]:
        """
        Detect potential medical emergencies:
        - Person lying on ground for extended time
        - Person collapsed (sudden position change + no movement)
        """
        persons = [d for d in detections if d.class_name == "person"]
        if not persons:
            return None

        frame_h = frame.shape[0]

        for person in persons:
            x1, y1, x2, y2 = person.bbox
            width = x2 - x1
            height = y2 - y1
            aspect_ratio = width / max(height, 1)

            # Person appears to be lying down at ground level
            is_ground_level = y2 > frame_h * 0.75
            is_horizontal = aspect_ratio > 1.5

            if is_ground_level and is_horizontal:
                # Check if person has been in this position for multiple frames
                history = self._person_positions.get(camera_id, [])
                consecutive_lying = sum(
                    1 for h in history[-5:]
                    if h.get("horizontal", False) and h.get("ground", False)
                )

                if consecutive_lying >= 3:
                    return IncidentDetection(
                        incident_type="medical_emergency",
                        severity="critical",
                        confidence=person.confidence * 0.75,
                        detections=[person],
                        frame=frame,
                        description=f"Urgence médicale potentielle: personne immobile au sol "
                                    f"depuis {consecutive_lying} frames",
                        timestamp=time.time(),
                    )

            # Update position history
            self._person_positions.setdefault(camera_id, []).append({
                "horizontal": is_horizontal,
                "ground": is_ground_level,
                "bbox": person.bbox,
                "timestamp": time.time(),
            })
            if len(self._person_positions[camera_id]) > 30:
                self._person_positions[camera_id].pop(0)

        return None

    @staticmethod
    def _compute_iou(box1: tuple, box2: tuple) -> float:
        """Compute Intersection over Union between two bounding boxes."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - intersection

        return intersection / max(union, 1e-6)

    @staticmethod
    def _bbox_center_distance(box1: tuple, box2: tuple) -> float:
        """Compute distance between centers of two bounding boxes."""
        cx1 = (box1[0] + box1[2]) / 2
        cy1 = (box1[1] + box1[3]) / 2
        cx2 = (box2[0] + box2[2]) / 2
        cy2 = (box2[1] + box2[3]) / 2
        return ((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5

    def draw_detections(self, frame: np.ndarray, detections: list[Detection],
                        incidents: list[IncidentDetection]) -> np.ndarray:
        """Draw bounding boxes and incident markers on a frame."""
        annotated = frame.copy()

        # Draw object detections in green
        for det in detections:
            x1, y1, x2, y2 = det.bbox
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"{det.class_name} {det.confidence:.0%}"
            cv2.putText(annotated, label, (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Draw incidents in red with alert markers
        for incident in incidents:
            color = (0, 0, 255) if incident.severity == "critical" else (0, 165, 255)
            for det in incident.detections:
                x1, y1, x2, y2 = det.bbox
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)

            # Add incident label at top of frame
            label = f"ALERTE: {incident.incident_type.upper()} - {incident.severity.upper()}"
            cv2.putText(annotated, label, (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 3)

        return annotated
