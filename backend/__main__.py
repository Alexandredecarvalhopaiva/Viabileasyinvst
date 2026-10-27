import os

import uvicorn

from .config import Settings

if __name__ == "__main__":
    Settings.from_env().validate()
    uvicorn.run(
        "backend.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "4173")),
        proxy_headers=True,
        forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1"),
        access_log=os.getenv("ACCESS_LOG", "false").lower() == "true",
    )
