"""
ImmofeuControl - Configuration settings.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "ImmofeuControl"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./immofeucontrol.db"

    # Detection
    detection_model: str = "yolov8n.pt"
    detection_confidence: float = 0.5
    detection_interval_ms: int = 500  # Analyze a frame every 500ms
    fall_detection_enabled: bool = True
    fire_detection_enabled: bool = True
    accident_detection_enabled: bool = True

    # Alerts
    alert_cooldown_seconds: int = 60  # Minimum time between alerts for same camera
    webhook_url: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    alert_email: Optional[str] = None
    sms_api_url: Optional[str] = None
    sms_api_key: Optional[str] = None
    emergency_phone: Optional[str] = None

    # Camera defaults
    camera_reconnect_delay: int = 5  # seconds
    camera_max_retries: int = 10
    snapshot_dir: str = "snapshots"
    recording_dir: str = "recordings"

    # Security
    secret_key: str = "CHANGE-ME-IN-PRODUCTION"
    api_key: Optional[str] = None

    model_config = {"env_file": ".env", "env_prefix": "IMMOFEU_"}
