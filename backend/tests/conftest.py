import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def prevent_live_ai(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_MODEL", raising=False)
    monkeypatch.delenv("AMBIGUITY_THRESHOLD", raising=False)

    def unexpected_request(*args, **kwargs):
        pytest.fail("Automated tests must not call the live NVIDIA service.")

    monkeypatch.setattr("app.insights.httpx.post", unexpected_request)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("APP_USERNAME", "test-user")
    monkeypatch.setenv("APP_PASSWORD", "test-password")
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth():
    return ("test-user", "test-password")
