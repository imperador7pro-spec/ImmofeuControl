"""
Excubya - Alert management system.
Handles sending real-time alerts via multiple channels.
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Optional

import httpx
from loguru import logger

from config import settings
from src.core.events import event_bus, Event


class AlertManager:
    """
    Multi-channel alert system.

    Channels:
    - WebSocket (real-time to dashboard)
    - Webhook (HTTP POST to external services)
    - Email (SMTP)
    - SMS (via API)
    """

    def __init__(self):
        self._websocket_clients: set = set()
        self._alert_history: list[dict] = []
        self._running = False
        self._http_client: Optional[httpx.AsyncClient] = None

    async def start(self):
        """Start the alert manager and subscribe to incident events."""
        self._running = True
        self._http_client = httpx.AsyncClient(timeout=10.0)
        event_bus.subscribe("incident.detected", self._on_incident)
        logger.info("Alert manager started")

    async def stop(self):
        """Stop the alert manager."""
        self._running = False
        if self._http_client:
            await self._http_client.aclose()
        event_bus.unsubscribe("incident.detected", self._on_incident)
        logger.info("Alert manager stopped")

    def register_websocket(self, ws):
        """Register a WebSocket client for real-time alerts."""
        self._websocket_clients.add(ws)
        logger.debug(f"WebSocket client registered (total: {len(self._websocket_clients)})")

    def unregister_websocket(self, ws):
        """Unregister a WebSocket client."""
        self._websocket_clients.discard(ws)
        logger.debug(f"WebSocket client unregistered (total: {len(self._websocket_clients)})")

    @property
    def alert_history(self) -> list[dict]:
        return self._alert_history.copy()

    async def _on_incident(self, event: Event):
        """Handle an incident event — send alerts on all configured channels."""
        data = event.data
        alert_message = self._format_alert(data)

        # Record in history
        alert_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "incident_type": data["incident_type"],
            "severity": data["severity"],
            "confidence": data["confidence"],
            "camera_id": data["camera_id"],
            "description": data["description"],
            "message": alert_message,
            "channels_sent": [],
        }

        # Send via all channels concurrently
        tasks = [self._send_websocket_alert(data, alert_record)]

        if settings.webhook_url:
            tasks.append(self._send_webhook_alert(data, alert_record))

        if settings.smtp_host and settings.alert_email:
            tasks.append(self._send_email_alert(alert_message, alert_record))

        if settings.sms_api_url and settings.emergency_phone:
            tasks.append(self._send_sms_alert(alert_message, alert_record))

        await asyncio.gather(*tasks, return_exceptions=True)

        self._alert_history.append(alert_record)
        # Keep only last 1000 alerts in memory
        if len(self._alert_history) > 1000:
            self._alert_history = self._alert_history[-1000:]

    def _format_alert(self, data: dict) -> str:
        """Format an alert message."""
        severity_emoji = {
            "critical": "CRITIQUE",
            "high": "ELEVE",
            "medium": "MOYEN",
            "low": "BAS",
        }
        sev = severity_emoji.get(data["severity"], data["severity"])
        return (
            f"[ALERTE {sev}] {data['incident_type'].upper()}\n"
            f"Camera: {data['camera_id']}\n"
            f"Confiance: {data['confidence']:.0%}\n"
            f"Description: {data['description']}\n"
            f"Heure: {datetime.fromtimestamp(data['timestamp']).strftime('%H:%M:%S')}"
        )

    async def _send_websocket_alert(self, data: dict, record: dict):
        """Send alert to all connected WebSocket clients."""
        if not self._websocket_clients:
            return

        message = json.dumps({
            "type": "alert",
            "data": {
                "incident_type": data["incident_type"],
                "severity": data["severity"],
                "confidence": data["confidence"],
                "camera_id": data["camera_id"],
                "description": data["description"],
                "snapshot_path": data.get("snapshot_path", ""),
                "timestamp": data["timestamp"],
                "detections": data.get("detections", []),
            },
        })

        disconnected = set()
        for ws in self._websocket_clients:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)

        for ws in disconnected:
            self._websocket_clients.discard(ws)

        record["channels_sent"].append("websocket")
        logger.info(f"Alert sent to {len(self._websocket_clients)} WebSocket clients")

    async def _send_webhook_alert(self, data: dict, record: dict):
        """Send alert via webhook (HTTP POST)."""
        try:
            payload = {
                "event": "incident_detected",
                "incident_type": data["incident_type"],
                "severity": data["severity"],
                "confidence": data["confidence"],
                "camera_id": data["camera_id"],
                "description": data["description"],
                "timestamp": data["timestamp"],
            }
            response = await self._http_client.post(settings.webhook_url, json=payload)
            response.raise_for_status()
            record["channels_sent"].append("webhook")
            logger.info(f"Webhook alert sent: {response.status_code}")
        except Exception as e:
            logger.error(f"Webhook alert failed: {e}")

    async def _send_email_alert(self, message: str, record: dict):
        """Send alert via email (SMTP)."""
        try:
            import smtplib
            from email.mime.text import MIMEText

            msg = MIMEText(message)
            msg["Subject"] = f"[Excubya] Alerte - {record['incident_type'].upper()}"
            msg["From"] = settings.smtp_user
            msg["To"] = settings.alert_email

            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._send_smtp, msg)
            record["channels_sent"].append("email")
            logger.info(f"Email alert sent to {settings.alert_email}")
        except Exception as e:
            logger.error(f"Email alert failed: {e}")

    def _send_smtp(self, msg):
        """Synchronous SMTP send."""
        import smtplib
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

    async def _send_sms_alert(self, message: str, record: dict):
        """Send alert via SMS API."""
        try:
            payload = {
                "to": settings.emergency_phone,
                "message": message,
            }
            headers = {}
            if settings.sms_api_key:
                headers["Authorization"] = f"Bearer {settings.sms_api_key}"

            response = await self._http_client.post(
                settings.sms_api_url, json=payload, headers=headers
            )
            response.raise_for_status()
            record["channels_sent"].append("sms")
            logger.info(f"SMS alert sent to {settings.emergency_phone}")
        except Exception as e:
            logger.error(f"SMS alert failed: {e}")
