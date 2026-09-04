import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
security = HTTPBasic()


def require_user(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    username = os.getenv("APP_USERNAME", "")
    password = os.getenv("APP_PASSWORD", "")
    if not username or not password or password == "replace-with-a-strong-password":
        raise HTTPException(
            503, "Set APP_USERNAME and APP_PASSWORD on the backend before signing in."
        )

    valid_username = secrets.compare_digest(credentials.username.encode(), username.encode())
    valid_password = secrets.compare_digest(credentials.password.encode(), password.encode())
    if not (valid_username and valid_password):
        raise HTTPException(
            401,
            "Incorrect username or password.",
            headers={"WWW-Authenticate": "Basic"},
        )
    return username
