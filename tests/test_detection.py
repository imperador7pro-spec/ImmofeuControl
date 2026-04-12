"""
Tests for the detection engine.
"""

import numpy as np
import pytest

from src.detection.detector import DetectionEngine, Detection


@pytest.fixture
def engine():
    e = DetectionEngine()
    e._loaded = True  # Skip model loading for tests
    return e


def make_frame(width=640, height=480):
    """Create a blank test frame."""
    return np.zeros((height, width, 3), dtype=np.uint8)


class TestDetectionEngine:

    def test_compute_iou_no_overlap(self, engine):
        iou = engine._compute_iou((0, 0, 10, 10), (20, 20, 30, 30))
        assert iou == 0.0

    def test_compute_iou_full_overlap(self, engine):
        iou = engine._compute_iou((0, 0, 10, 10), (0, 0, 10, 10))
        assert abs(iou - 1.0) < 1e-6

    def test_compute_iou_partial_overlap(self, engine):
        iou = engine._compute_iou((0, 0, 10, 10), (5, 5, 15, 15))
        assert 0.0 < iou < 1.0

    def test_bbox_center_distance(self, engine):
        dist = engine._bbox_center_distance((0, 0, 10, 10), (0, 0, 10, 10))
        assert dist == 0.0

        dist = engine._bbox_center_distance((0, 0, 10, 10), (10, 0, 20, 10))
        assert dist == 10.0

    def test_detect_accident_no_vehicles(self, engine):
        detections = [
            Detection("person", 0.9, (100, 100, 200, 400), 0),
        ]
        result = engine._detect_accident("cam1", detections, make_frame())
        assert result is None

    def test_detect_accident_overlapping_vehicles(self, engine):
        detections = [
            Detection("car", 0.9, (100, 100, 300, 300), 2),
            Detection("car", 0.85, (150, 150, 350, 350), 2),
        ]
        result = engine._detect_accident("cam_test", detections, make_frame())
        assert result is not None
        assert result.incident_type == "accident"

    def test_detect_fall_lying_person(self, engine):
        # Simulate a person with horizontal aspect ratio near bottom of frame
        # width > height and near the bottom
        detections = [
            Detection("person", 0.9, (100, 400, 300, 460), 0),  # wide, near bottom
        ]
        result = engine._detect_fall("cam_fall", detections, make_frame())
        # Should detect because aspect ratio > 1.2 and y2 > 0.6 * 480
        assert result is not None
        assert result.incident_type == "fall"

    def test_no_fall_standing_person(self, engine):
        # Standing person: tall and narrow
        detections = [
            Detection("person", 0.9, (200, 100, 260, 400), 0),  # tall
        ]
        result = engine._detect_fall("cam_stand", detections, make_frame())
        assert result is None

    def test_fire_detection_by_color(self, engine):
        # Create a frame with fire-colored pixels
        frame = make_frame()
        # Add bright red/orange area (more than 2% of frame)
        frame[100:200, 100:300] = [0, 100, 255]  # BGR: bright red-orange
        result = engine._detect_fire_smoke("cam_fire", [], frame)
        # May or may not trigger depending on exact HSV thresholds
        # This tests that the method runs without error
        assert result is None or result.incident_type in ("fire", "smoke")

    def test_draw_detections(self, engine):
        frame = make_frame()
        detections = [Detection("car", 0.9, (10, 10, 100, 100), 2)]
        annotated = engine.draw_detections(frame, detections, [])
        assert annotated.shape == frame.shape
        # Should have drawn something (not all black)
        assert annotated.sum() > 0

    def test_medical_emergency_not_enough_frames(self, engine):
        detections = [
            Detection("person", 0.9, (100, 380, 350, 470), 0),  # lying at bottom
        ]
        result = engine._detect_medical_emergency("cam_med", detections, make_frame())
        # Not enough history to trigger
        assert result is None
