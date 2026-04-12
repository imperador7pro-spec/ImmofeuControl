"""
ImmofeuControl - API Pydantic schemas.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# --- Camera schemas ---

class CameraCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    stream_url: str = Field(..., min_length=1)
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    zone_type: str = "general"
    detection_enabled: bool = True


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    stream_url: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    enabled: Optional[bool] = None
    detection_enabled: Optional[bool] = None
    zone_type: Optional[str] = None


class CameraResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    stream_url: str
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    status: str
    enabled: bool
    detection_enabled: bool
    zone_type: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Incident schemas ---

class IncidentResponse(BaseModel):
    id: int
    camera_id: int
    incident_type: str
    severity: str
    confidence: float
    description: Optional[str]
    snapshot_path: Optional[str]
    detected_at: datetime
    resolved_at: Optional[datetime]
    is_false_alarm: bool

    class Config:
        from_attributes = True


class IncidentUpdate(BaseModel):
    is_false_alarm: Optional[bool] = None
    resolved_at: Optional[datetime] = None


# --- Alert schemas ---

class AlertResponse(BaseModel):
    id: int
    incident_id: int
    alert_type: str
    status: str
    recipient: Optional[str]
    message: str
    sent_at: Optional[datetime]
    acknowledged_at: Optional[datetime]
    response_time_seconds: Optional[float]

    class Config:
        from_attributes = True


# --- Emergency Contact schemas ---

class EmergencyContactCreate(BaseModel):
    name: str = Field(..., min_length=1)
    role: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    webhook_url: Optional[str] = None
    priority: int = 0


class EmergencyContactResponse(BaseModel):
    id: int
    name: str
    role: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    webhook_url: Optional[str]
    is_active: bool
    priority: int

    class Config:
        from_attributes = True


# --- Stats ---

class SystemStats(BaseModel):
    cameras_total: int
    cameras_online: int
    cameras_offline: int
    cameras_error: int
    incidents_total: int
    incidents_today: int
    alerts_sent: int
    frames_analyzed: int
    uptime_seconds: float
