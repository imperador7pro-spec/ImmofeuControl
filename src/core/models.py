"""
Excubya - Database models.
Defines all persistent entities: cameras, incidents, alerts.
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, Enum, ForeignKey,
    create_engine
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
import enum

Base = declarative_base()


class CameraStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    MAINTENANCE = "maintenance"


class IncidentType(str, enum.Enum):
    ACCIDENT = "accident"
    FALL = "fall"
    FIRE = "fire"
    SMOKE = "smoke"
    INTRUSION = "intrusion"
    CROWD_ANOMALY = "crowd_anomaly"
    MEDICAL_EMERGENCY = "medical_emergency"
    UNKNOWN = "unknown"


class IncidentSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    FALSE_ALARM = "false_alarm"


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    stream_url = Column(String(1024), nullable=False)
    location_name = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(String(20), default=CameraStatus.OFFLINE)
    enabled = Column(Boolean, default=True)
    detection_enabled = Column(Boolean, default=True)
    zone_type = Column(String(50), default="general")  # road, building, public_space
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    incidents = relationship("Incident", back_populates="camera")

    def __repr__(self):
        return f"<Camera(id={self.id}, name='{self.name}', status='{self.status}')>"


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=False)
    incident_type = Column(String(30), nullable=False)
    severity = Column(String(10), default=IncidentSeverity.MEDIUM)
    confidence = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    snapshot_path = Column(String(1024), nullable=True)
    video_clip_path = Column(String(1024), nullable=True)
    detected_objects = Column(Text, nullable=True)  # JSON string of detected objects
    bounding_boxes = Column(Text, nullable=True)  # JSON string of bounding boxes
    detected_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    is_false_alarm = Column(Boolean, default=False)

    camera = relationship("Camera", back_populates="incidents")
    alerts = relationship("Alert", back_populates="incident")

    def __repr__(self):
        return f"<Incident(id={self.id}, type='{self.incident_type}', severity='{self.severity}')>"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    alert_type = Column(String(20), nullable=False)  # websocket, email, sms, webhook
    status = Column(String(20), default=AlertStatus.PENDING)
    recipient = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    response_time_seconds = Column(Float, nullable=True)

    incident = relationship("Incident", back_populates="alerts")

    def __repr__(self):
        return f"<Alert(id={self.id}, type='{self.alert_type}', status='{self.status}')>"


class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    role = Column(String(100), nullable=True)  # pompiers, samu, police, custom
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    webhook_url = Column(String(1024), nullable=True)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # Higher = more priority
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


async def init_db(database_url: str):
    """Initialize the database and create all tables."""
    engine = create_async_engine(database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine


def get_session_factory(engine):
    """Create an async session factory."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
