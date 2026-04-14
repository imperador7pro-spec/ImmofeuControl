"""
Excubya - Entry point.
Run with: python main.py
"""

import os
import uvicorn
from config import settings

if __name__ == "__main__":
    # Railway/Heroku/Cloud providers inject PORT env var
    port = int(os.environ.get("PORT", settings.port))
    uvicorn.run(
        "src.app:app",
        host=settings.host,
        port=port,
        reload=settings.debug,
        log_level="info",
    )
