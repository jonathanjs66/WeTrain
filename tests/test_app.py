import pytest
from app import create_app
from app.extensions import db


ADMIN_HEADERS = {"X-Role": "admin"}
TRAINER_1_HEADERS = {"X-Role": "trainer", "X-Trainer-Id": "1"}
TRAINER_2_HEADERS = {"X-Role": "trainer", "X-Trainer-Id": "2"}


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


def test_admin_can_create_trainer(client):
    response = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "John Doe"
    assert "id" in data


def test_trainer_cannot_create_trainer(client):
    response = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=TRAINER_1_HEADERS,
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "admin access required"}


def test_admin_can_create_session(client):
    trainer_response = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    )
    trainer_id = trainer_response.get_json()["id"]

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
        headers=ADMIN_HEADERS,
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["trainer_id"] == trainer_id
    assert data["client_name"] == "Alice"


def test_trainer_can_create_own_session(client):
    trainer_response = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    )
    trainer_id = trainer_response.get_json()["id"]

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
        headers={"X-Role": "trainer", "X-Trainer-Id": str(trainer_id)},
    )

    assert response.status_code == 201


def test_trainer_cannot_create_other_trainer_session(client):
    first_trainer = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    ).get_json()

    second_trainer = client.post(
        "/api/trainers/",
        json={"name": "Jane Doe"},
        headers=ADMIN_HEADERS,
    ).get_json()

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": second_trainer["id"],
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
        headers={"X-Role": "trainer", "X-Trainer-Id": str(first_trainer["id"])},
    )

    assert response.status_code == 403
    assert response.get_json() == {
        "error": "you can only access your own sessions"
    }


def test_reject_overlapping_session(client):
    trainer_response = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    )
    trainer_id = trainer_response.get_json()["id"]

    first_response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_id,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
        headers=ADMIN_HEADERS,
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
        headers=ADMIN_HEADERS,
    )

    assert overlap_response.status_code == 409
    assert overlap_response.get_json() == {
        "error": "session overlaps with existing session"
    }


def test_trainer_only_sees_own_sessions(client):
    trainer_1 = client.post(
        "/api/trainers/",
        json={"name": "John Doe"},
        headers=ADMIN_HEADERS,
    ).get_json()

    trainer_2 = client.post(
        "/api/trainers/",
        json={"name": "Jane Doe"},
        headers=ADMIN_HEADERS,
    ).get_json()

    client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_1["id"],
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
        headers=ADMIN_HEADERS,
    )

    client.post(
        "/api/sessions/",
        json={
            "trainer_id": trainer_2["id"],
            "client_name": "Bob",
            "starts_at": "2026-04-05T12:00:00",
            "ends_at": "2026-04-05T13:00:00",
        },
        headers=ADMIN_HEADERS,
    )

    response = client.get(
        "/api/sessions/",
        headers={"X-Role": "trainer", "X-Trainer-Id": str(trainer_1["id"])},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["trainer_id"] == trainer_1["id"]
    assert data[0]["client_name"] == "Alice"
