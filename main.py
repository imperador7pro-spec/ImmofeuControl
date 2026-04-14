"""
Excubya - Entry point.
Run with: python main.py
"""

import uvicorn
from config import settings

if __name__ == "__main__":
    uvicorn.run(
        "src.app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )
