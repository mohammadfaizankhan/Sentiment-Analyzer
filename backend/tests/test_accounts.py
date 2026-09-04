import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from vercel import blob

from app import accounts
from app import auth as authentication
from app.main import app


@pytest.fixture(autouse=True)
def isolated_accounts(monkeypatch, tmp_path):
    monkeypatch.setenv('AUTH_SECRET', 'test-secret-that-is-at-least-32-characters')
    monkeypatch.setenv('ACCOUNTS_DB_PATH', str(tmp_path / 'accounts.sqlite3'))
    for key in ('VERCEL', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN'):
        monkeypatch.delenv(key, raising=False)


USER = {'action': 'register', 'name': 'Test Analyst', 'email': 'test@example.com',
        'password': 'test-password-123'}


def test_registration_login_session_and_logout(client):
    assert client.get('/api/auth').json() == {'user': None}
    response = client.post('/api/auth', json={**USER, 'email': ' TEST@Example.com '})
    assert response.status_code == 200
    assert response.json() == {'user': {'name': 'Test Analyst', 'email': 'test@example.com'}}
    cookie = response.headers['set-cookie']
    assert 'HttpOnly' in cookie and 'SameSite=lax' in cookie and 'Max-Age=86400' in cookie
    assert response.headers['cache-control'] == 'no-store'
    stored = accounts.get_account(USER['email'])
    assert 'password' not in stored and USER['password'] not in json.dumps(stored)
    assert client.get('/api/auth').json()['user']['email'] == USER['email']
    assert client.post('/api/analyze', files={'file': ('a.txt', b'Excellent service.')}).status_code == 200
    client.post('/api/auth', json={'action': 'logout'})
    assert client.get('/api/auth').json()['user'] is None
    assert client.post('/api/analyze', files={'file': ('a.txt', b'Good.')}).status_code == 401
    # A fresh client uses the same durable database after logout/restart.
    with TestClient(app) as fresh:
        response = fresh.post('/api/auth', json={**USER, 'action': 'login'})
        assert response.status_code == 200
        assert fresh.get('/api/auth').json()['user']['name'] == 'Test Analyst'


def test_duplicate_does_not_replace_password(client):
    assert client.post('/api/auth', json=USER).status_code == 200
    assert client.post('/api/auth', json={**USER, 'password': 'different-password'}).status_code == 409
    assert client.post('/api/auth', json={**USER, 'action': 'login'}).status_code == 200
    assert client.post('/api/auth', json={**USER, 'action': 'login', 'password': 'wrong-password'}).status_code == 401


@pytest.mark.parametrize('change,status', [({'email': 'bad'}, 400), ({'password': 'short'}, 400),
    ({'name': ' '}, 400), ({'password': 'x' * 129}, 422), ({'action': 'unknown'}, 422)])
def test_invalid_registration(client, change, status):
    response = client.post('/api/auth', json={**USER, **change})
    assert response.status_code == status
    assert 'test-password' not in response.text


def test_cross_origin_auth_and_cookie_analysis_rejected(client):
    assert client.post('/api/auth', json=USER, headers={'Origin': 'https://untrusted.example'}).status_code == 403
    assert client.post('/api/auth', json=USER, headers={'Origin': 'http://localhost:5173'}).status_code == 200
    assert client.post('/api/auth', json={'action': 'logout'}, headers={'Origin': 'https://untrusted.example'}).status_code == 403
    assert client.post('/api/analyze', files={'file': ('a.txt', b'Good.')}, headers={'Origin': 'https://untrusted.example'}).status_code == 403


def test_tampered_and_expired_sessions(client, monkeypatch):
    client.post('/api/auth', json=USER)
    token = client.cookies.get(authentication.COOKIE)
    client.cookies.clear()
    client.cookies.set(authentication.COOKIE, token + 'tampered')
    assert client.get('/api/auth').json()['user'] is None
    client.cookies.set(authentication.COOKIE, token)
    monkeypatch.setattr(authentication.time, 'time', lambda: 9999999999)
    assert client.get('/api/auth').json()['user'] is None


def test_secure_cookie_over_https():
    with TestClient(app, base_url='https://testserver') as client:
        assert 'Secure' in client.post('/api/auth', json=USER).headers['set-cookie']


def test_cloud_store_is_private_and_create_only(monkeypatch):
    monkeypatch.setenv('BLOB_STORE_ID', 'test-store')
    records = {}
    def put(path, data, **options):
        assert options['access'] == 'private'
        assert options['overwrite'] is False and options['add_random_suffix'] is False
        assert USER['email'] not in path
        if path in records:
            raise blob.BlobError('already exists')
        records[path] = data
    def get(path, **options):
        assert options['access'] == 'private' and options['use_cache'] is False
        if path not in records:
            raise blob.BlobNotFoundError()
        return SimpleNamespace(content=records[path].encode())
    monkeypatch.setattr(accounts.blob, 'put', put)
    monkeypatch.setattr(accounts.blob, 'get', get)
    with TestClient(app) as client:
        assert client.post('/api/auth', json=USER).status_code == 200
        assert client.get('/api/auth').json()['user']['email'] == USER['email']
    with pytest.raises(Exception) as error:
        accounts.create_account({'email': USER['email']})
    assert error.value.status_code == 409


def test_production_cannot_fall_back_to_ephemeral_storage(client, monkeypatch):
    monkeypatch.setenv('VERCEL', '1')
    assert client.post('/api/auth', json=USER).status_code == 503


def test_storage_failure_returns_safe_message(client, monkeypatch):
    monkeypatch.setenv('BLOB_STORE_ID', 'test-store')
    def unavailable(*args, **kwargs):
        raise blob.BlobError('private provider information')
    monkeypatch.setattr(accounts.blob, 'get', unavailable)
    response = client.post('/api/auth', json=USER)
    assert response.status_code == 503
    assert 'private provider' not in response.text
