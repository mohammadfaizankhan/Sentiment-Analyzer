import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field

from .accounts import DATA_DIR, create_account, get_account

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
security = HTTPBasic(auto_error=False)
router = APIRouter()
COOKIE = "signalsense_session"
SESSION_SECONDS = 86400


def signing_key() -> bytes:
    configured = os.getenv("AUTH_SECRET", "")
    if configured:
        if len(configured) < 32:
            raise HTTPException(503, "AUTH_SECRET must contain at least 32 characters.")
        return configured.encode()
    if os.getenv("VERCEL"):
        raise HTTPException(503, "Session authentication is not configured.")
    # Persist once locally; never generate a different secret on every process restart.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "session-secret"
    try:
        with path.open("x") as handle:
            handle.write(secrets.token_urlsafe(48))
    except FileExistsError:
        pass
    return path.read_bytes()


def check_origin(request: Request):
    origin = request.headers.get("origin")
    allowed = {item.strip().rstrip("/") for item in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")}
    allowed.add(str(request.base_url).rstrip("/"))
    if origin and origin.rstrip("/") not in allowed:
        raise HTTPException(403, "This request origin is not allowed.")


def public_user(account: dict) -> dict:
    return {"name": account["name"], "email": account["email"]}


def session_user(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE, "")
    if not token or len(token) > 2048:
        return None
    try:
        payload, signature = token.split(".")
        expected = hmac.new(signing_key(), payload.encode(), hashlib.sha256).hexdigest()
        if not secrets.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if not isinstance(data, dict) or not isinstance(data.get("exp"), int):
            return None
        if data["exp"] <= time.time() or not isinstance(data.get("email"), str):
            return None
        account = get_account(data["email"])
        return public_user(account) if account else None
    except (ValueError, UnicodeError, TypeError):
        return None


def set_session(response: Response, request: Request, email: str):
    payload = base64.urlsafe_b64encode(json.dumps({
        "email": email, "exp": int(time.time()) + SESSION_SECONDS,
        "nonce": secrets.token_hex(16),
    }).encode()).decode().rstrip("=")
    signature = hmac.new(signing_key(), payload.encode(), hashlib.sha256).hexdigest()
    response.set_cookie(
        COOKIE, f"{payload}.{signature}", max_age=SESSION_SECONDS,
        httponly=True, secure=bool(os.getenv("VERCEL")) or request.url.scheme == "https",
        samesite="lax", path="/",
    )


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class AuthInput(BaseModel):
    action: Literal["register", "login", "logout"]
    name: str = Field(default="", max_length=60)
    email: str = Field(default="", max_length=254)
    password: str = Field(default="", max_length=128)


@router.get("/api/auth")
def current_session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"user": session_user(request)}


@router.post("/api/auth")
def authenticate(body: AuthInput, request: Request, response: Response):
    check_origin(request)
    response.headers["Cache-Control"] = "no-store"
    if body.action == "logout":
        response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax",
                               secure=bool(os.getenv("VERCEL")) or request.url.scheme == "https")
        return {"user": None}
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(400, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(400, "Use a password with at least 8 characters.")
    signing_key()  # Check configuration before creating an account.
    account = get_account(email)
    if body.action == "register":
        name = body.name.strip()
        if len(name) < 2:
            raise HTTPException(400, "Enter your full name (at least 2 characters).")
        if account:
            raise HTTPException(409, "An account already exists for this email.")
        salt = secrets.token_hex(16)
        account = {"email": email, "name": name, "salt": salt,
                   "hash": password_hash(body.password, salt), "created_at": int(time.time())}
        create_account(account)
    else:
        candidate = password_hash(body.password, account["salt"] if account else "00" * 16)
        if not account or not secrets.compare_digest(candidate, account["hash"]):
            raise HTTPException(401, "Incorrect email or password.")
    set_session(response, request, email)
    return {"user": public_user(account)}


def require_user(request: Request, credentials: HTTPBasicCredentials | None = Depends(security)) -> str:
    if credentials is None:
        check_origin(request)
        user = session_user(request)
        if user:
            return user["email"]
        raise HTTPException(401, "Please sign in to continue.",
                            headers={"WWW-Authenticate": "Basic"})
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
