import logging
import os

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .auth import require_user
from .auth import router as auth_router
from .config import MAX_FILE_BYTES
from .models import AnalysisResult, LoginResult
from .workflow import analyze_conversation

logger = logging.getLogger(__name__)
app = FastAPI(title="Sentiment Analyzer", version="1.0.0")
app.include_router(auth_router)


class LimitRequestBody:
    """Bound multipart uploads before the parser buffers them, including chunked requests."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_FILE_BYTES + 8_192:
                response = JSONResponse(
                    {"detail": "Upload a .txt file no larger than 100 KB."},
                    status_code=413,
                )
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


app.add_middleware(LimitRequestBody)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": "Check the account fields and try again." if request.url.path == "/api/auth"
                 else "Attach a .txt file and use true/false for include_insights."},
    )


@app.post("/api/login", response_model=LoginResult)
def login(username: str = Depends(require_user)):
    return {"username": username}


@app.post("/api/analyze", response_model=AnalysisResult)
async def analyze(
    file: UploadFile = File(...),
    include_insights: bool = Form(False),
    username: str = Depends(require_user),
):
    try:
        filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
        if not filename.lower().endswith(".txt"):
            raise HTTPException(400, "Please upload a .txt file.")
        raw = await file.read(MAX_FILE_BYTES + 1)
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(413, "Upload a .txt file no larger than 100 KB.")
        try:
            text = raw.decode("utf-8-sig").strip()
        except UnicodeDecodeError:
            raise HTTPException(400, "Save your transcript as UTF-8 text and try again.") from None
        if not text:
            raise HTTPException(400, "The file is empty. Add conversation text and try again.")
        if any(ord(character) < 32 and character not in "\n\r\t" for character in text):
            raise HTTPException(400, "The file contains binary or unsupported control characters.")
        try:
            result = await run_in_threadpool(analyze_conversation, text, include_insights)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        except Exception:  # noqa: BLE001 -- public boundary must not expose private failures
            # Do not log transcript content or credentials.
            logger.error("Sentiment analysis failed.")
            raise HTTPException(500, "Analysis could not be completed. Please try again.") from None
        return {"filename": filename, **result}
    finally:
        await file.close()
