"""Durable accounts: SQLite locally, private Vercel Blob in production."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path

import httpx
from fastapi import HTTPException
from vercel import blob

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def account_path(email: str) -> str:
    return f"accounts/{hashlib.sha256(email.encode()).hexdigest()}.json"


def cloud_store() -> bool:
    configured = bool(os.getenv("BLOB_READ_WRITE_TOKEN") or os.getenv("BLOB_STORE_ID"))
    if os.getenv("VERCEL") and not configured:
        raise HTTPException(503, "Account storage is not configured.")
    return configured


def database():
    path = Path(os.getenv("ACCOUNTS_DB_PATH", str(DATA_DIR / "accounts.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.execute("CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, data TEXT)")
    return connection


def get_account(email: str) -> dict | None:
    try:
        if cloud_store():
            try:
                result = blob.get(account_path(email), access="private", use_cache=False, timeout=10)
            except blob.BlobNotFoundError:
                return None
            return json.loads(result.content)
        connection = database()
        try:
            row = connection.execute("SELECT data FROM accounts WHERE email = ?", (email,)).fetchone()
            return json.loads(row[0]) if row else None
        finally:
            connection.close()
    except (blob.BlobError, httpx.HTTPError, sqlite3.Error, OSError, ValueError):
        raise HTTPException(503, "Account storage is temporarily unavailable. Please try again.") from None


def create_account(account: dict):
    email = account["email"]
    try:
        if cloud_store():
            try:
                blob.put(
                    account_path(email), json.dumps(account), access="private",
                    content_type="application/json", add_random_suffix=False, overwrite=False,
                )
            except blob.BlobError:
                # A competing registration may have created this exact key. Never overwrite it.
                if get_account(email):
                    raise HTTPException(409, "An account already exists for this email.") from None
                raise
            return
        connection = database()
        try:
            with connection:
                connection.execute("INSERT INTO accounts VALUES (?, ?)", (email, json.dumps(account)))
        finally:
            connection.close()
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account already exists for this email.") from None
    except (blob.BlobError, httpx.HTTPError, sqlite3.Error, OSError):
        raise HTTPException(503, "Account storage is temporarily unavailable. Please try again.") from None
