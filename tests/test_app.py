import pytest

from app import create_app
from app.extensions import db


@pytest.fixture
def client():
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "SECRET_KEY": "test-secret",
        }
    )

    with app.app_context():
        db.drop_all()
        db.create_all()

        client = app.test_client()
        yield client

        db.session.remove()
        db.drop_all()


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_create_trainer(client):
    response = client.post("/api/trainers/", json={"name": "John Doe"})

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "John Doe"
    assert "id" in data


def test_create_session(client):
    trainer_response = client.post("/api/trainers/", json={"name": "John Doe"})
    trainer_id = trainer_response.get_json()["id"]

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["trainer_id"] == trainer_id
    assert data["client_name"] == "Alice"


def test_reject_overlapping_session(client):
    trainer_response = client.post("/api/trainers/", json={"name": "John Doe"})
    trainer_id = trainer_response.get_json()["id"]

    first_response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )

    assert first_response.status_code == 201

    overlap_response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Bob",
            "starts_at": "2026-04-05T10:30:00",
            "ends_at": "2026-04-05T11:30:00",
        },
    )

    assert overlap_response.status_code == 409
    assert overlap_response.get_json() == {
        "error": "session overlaps with existing session"
    }
