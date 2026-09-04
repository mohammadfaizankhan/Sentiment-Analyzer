import pytest


def test_login_and_authentication(client, auth):
    assert client.post("/api/login", auth=auth).json() == {"username": "test-user"}
    assert client.post("/api/login").status_code == 401
    assert client.post("/api/login", auth=("test-user", "wrong")).status_code == 401
    assert (
        client.post("/api/analyze", files={"file": ("call.txt", b"Great service.")}).status_code
        == 401
    )


def test_unconfigured_authentication_fails_closed(client, monkeypatch, auth):
    monkeypatch.delenv("APP_PASSWORD")
    assert client.post("/api/login", auth=auth).status_code == 503


def test_real_graph_response_contract(client, auth):
    response = client.post(
        "/api/analyze",
        auth=auth,
        files={
            "file": (
                "call.txt",
                b"Customer: I hate this terrible service.\nAgent: Your order is on the table.\nCustomer: I love it, thank you!",
            )
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "call.txt"
    assert [s["sentiment"] for s in data["sentences"]] == [
        "Negative",
        "Neutral",
        "Positive",
    ]
    assert sum(item["count"] for item in data["breakdown"]) == 3
    assert data["kpis"]["customer_negative_percentage"] == 50.0
    assert data["kpis"]["sentiment_change"] == "Improved"
    assert all("score" not in sentence for sentence in data["sentences"])


@pytest.mark.parametrize(
    "filename,content,status",
    [
        ("call.pdf", b"Great service.", 400),
        ("call.txt", b"", 400),
        ("call.txt", b" \n\t", 400),
        ("call.txt", b"123 !! ...", 400),
        ("call.txt", b"\xff\xfeinvalid", 400),
        ("call.txt", b"Hello\x00world", 400),
        ("call.txt", b"a" * 100_001, 413),
        ("call.txt", b"a" * 120_000, 413),
        ("call.txt", b"Good.\n" * 501, 400),
        ("call.txt", b"a" * 2001, 400),
    ],
    ids=[
        "extension",
        "empty",
        "whitespace",
        "nontext",
        "encoding",
        "binary",
        "file-limit",
        "body-limit",
        "sentence-limit",
        "sentence-length",
    ],
)
def test_invalid_uploads(client, auth, filename, content, status):
    response = client.post("/api/analyze", auth=auth, files={"file": (filename, content)})
    assert response.status_code == status
    assert isinstance(response.json()["detail"], str)


def test_missing_file_and_wrong_field(client, auth):
    assert client.post("/api/analyze", auth=auth).status_code == 422
    assert (
        client.post("/api/analyze", auth=auth, files={"wrong": ("a.txt", b"Good.")}).status_code
        == 422
    )


def test_bom_uppercase_extension_and_unknown_customer(client, auth):
    response = client.post(
        "/api/analyze",
        auth=auth,
        files={"file": ("CALL.TXT", "\ufeffThe parcel is on the table.".encode())},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["overall_sentiment"] == "Neutral"
    assert data["kpis"]["customer_negative_percentage"] is None
    assert data["kpis"]["sentiment_change"] is None


def test_analysis_failure_returns_safe_message(client, auth, monkeypatch):
    def fail(text, include_insights=False):
        raise RuntimeError("private internal details")

    monkeypatch.setattr("app.main.analyze_conversation", fail)
    response = client.post("/api/analyze", auth=auth, files={"file": ("a.txt", b"Good service.")})
    assert response.status_code == 500
    assert "private" not in response.text


def test_cors_preflight(client):
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization",
    }
    response = client.options("/api/analyze", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == headers["Origin"]
    headers["Origin"] = "https://untrusted.example"
    assert client.options("/api/analyze", headers=headers).status_code == 400
