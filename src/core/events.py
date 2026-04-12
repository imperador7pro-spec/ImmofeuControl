"""
ImmofeuControl - Event bus for real-time communication between components.
Uses asyncio queues and pub/sub pattern.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Coroutine
from loguru import logger


@dataclass
class Event:
    """An event in the system."""
    event_type: str
    data: dict
    timestamp: datetime = field(default_factory=datetime.utcnow)
    source: str = ""


class EventBus:
    """Central event bus for real-time inter-component communication."""

    def __init__(self):
        self._subscribers: dict[str, list[Callable[[Event], Coroutine]]] = {}
        self._event_queue: asyncio.Queue[Event] = asyncio.Queue()
        self._running = False
        self._task: asyncio.Task | None = None

    def subscribe(self, event_type: str, handler: Callable[[Event], Coroutine]):
        """Subscribe to an event type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.debug(f"Handler subscribed to '{event_type}'")

    def unsubscribe(self, event_type: str, handler: Callable[[Event], Coroutine]):
        """Unsubscribe from an event type."""
        if event_type in self._subscribers:
            self._subscribers[event_type].remove(handler)

    async def publish(self, event: Event):
        """Publish an event to all subscribers."""
        await self._event_queue.put(event)

    async def _process_events(self):
        """Main event processing loop."""
        while self._running:
            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=1.0)
                handlers = self._subscribers.get(event.event_type, [])
                # Also notify wildcard subscribers
                handlers += self._subscribers.get("*", [])

                for handler in handlers:
                    try:
                        await handler(event)
                    except Exception as e:
                        logger.error(f"Error in event handler for '{event.event_type}': {e}")
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error processing event: {e}")

    async def start(self):
        """Start the event bus."""
        self._running = True
        self._task = asyncio.create_task(self._process_events())
        logger.info("Event bus started")

    async def stop(self):
        """Stop the event bus."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Event bus stopped")


# Singleton event bus
event_bus = EventBus()
