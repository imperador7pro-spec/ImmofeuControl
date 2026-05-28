"""
Tests for incident/alert persistence in the AlertManager.

Regression guard: detected incidents must be written to the database so they
show up in the dashboard table, the /api/incidents endpoint and the stats.
"""

import time

import pytest
from sqlalchemy import select

from src.alerts.alert_manager import AlertManager
from src.core.models import init_db, get_session_factory, Incident, Alert
from src.core.events import Event


@pytest.fixture
async def session_factory(tmp_path):
    db_url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    engine = await init_db(db_url)
    factory = get_session_factory(engine)
    yield factory
    await engine.dispose()


def _incident_event() -> Event:
    return Event(
        event_type="incident.detected",
        data={
            "camera_id": 1,
            "incident_type": "fall",
            "severity": "high",
            "confidence": 0.82,
            "description": "Chute detectee: personne au sol",
            "snapshot_path": "snapshots/1_fall.jpg",
            "timestamp": time.time(),
            "detections": [{"class_name": "person", "confidence": 0.82, "bbox": [10, 10, 50, 90]}],
        },
        source="test",
    )


async def test_incident_is_persisted(session_factory):
    manager = AlertManager()
    manager.set_session_factory(session_factory)

    await manager._on_incident(_incident_event())

    async with session_factory() as session:
        incidents = (await session.execute(select(Incident))).scalars().all()

    assert len(incidents) == 1
    assert incidents[0].incident_type == "fall"
    assert incidents[0].camera_id == 1
    assert incidents[0].confidence == pytest.approx(0.82)


async def test_no_crash_without_session_factory(session_factory):
    # Without a session factory the manager must still handle the event gracefully.
    manager = AlertManager()
    await manager._on_incident(_incident_event())  # should not raise

    # And nothing should have been written to the test database.
    async with session_factory() as session:
        incidents = (await session.execute(select(Incident))).scalars().all()
    assert incidents == []


async def test_alert_rows_persisted_for_delivered_channels(session_factory):
    manager = AlertManager()
    manager.set_session_factory(session_factory)

    # Register a fake WebSocket client so the websocket channel is "delivered".
    class FakeWS:
        async def send_text(self, _):
            return None

    manager.register_websocket(FakeWS())
    await manager._on_incident(_incident_event())

    async with session_factory() as session:
        alerts = (await session.execute(select(Alert))).scalars().all()

    assert len(alerts) == 1
    assert alerts[0].alert_type == "websocket"
    assert alerts[0].status == "sent"
