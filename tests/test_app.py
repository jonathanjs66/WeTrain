import pytest


from app import create_app
from app.routes.auth import login
from app.routes.sessions import Session
from app.extensions import db ,limiter
from app.models import Trainer, User



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

        trainer = Trainer(name="John Doe")
        db.session.add(trainer)
        db.session.flush()

        admin_user = User(username="admin", role="admin")
        admin_user.set_password("admin123")
        db.session.add(admin_user)

        trainer_user = User(
            username="trainer1",
            role="trainer",
            trainer_id=trainer.id,
        )
        trainer_user.set_password("trainer123")
        db.session.add(trainer_user)

        other_trainer = Trainer(name="Jane Doe")
        db.session.add(other_trainer)
        db.session.flush()

        other_trainer_user = User(
            username="trainer2",
            role="trainer",
            trainer_id=other_trainer.id,
        )
        other_trainer_user.set_password("trainer456")
        db.session.add(other_trainer_user)

        db.session.commit()

        client = app.test_client()
        yield client

        db.session.remove()
        db.drop_all()


def login(client, username, password):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}

def test_ready(client):
    response = client.get("/ready")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "database": "reachable"}


def test_login_success(client):
    response = login(client, "admin", "admin123")

    assert response.status_code == 200
    data = response.get_json()
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"


def test_login_invalid_credentials(client):
    response = login(client, "admin", "wrong-password")

    assert response.status_code == 401
    assert response.get_json() == {"error": "invalid credentials"}


def test_admin_can_create_trainer(client):
    login(client, "admin", "admin123")

    response = client.post(
        "/api/trainers/",
        json={"name": "Another Trainer"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Another Trainer"


def test_trainer_cannot_create_trainer(client):
    login(client, "trainer1", "trainer123")

    response = client.post(
        "/api/trainers/",
        json={"name": "Another Trainer"},
    )

    assert response.status_code == 403
    assert response.get_json() == {"error": "admin access required"}


def test_admin_can_create_session(client):
    login(client, "admin", "admin123")

    trainers_response = client.get("/api/trainers/")
    trainer_id = trainers_response.get_json()[0]["id"]

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


def test_trainer_can_create_own_session(client):
    login(client, "trainer1", "trainer123")

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 1,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )

    assert response.status_code == 201


def test_trainer_cannot_create_other_trainer_session(client):
    login(client, "trainer1", "trainer123")

    response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 2,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )

    assert response.status_code == 403
    assert response.get_json() == {
        "error": "you can only access your own sessions"
    }


def test_reject_overlapping_session(client):
    login(client, "admin", "admin123")

    response_1 = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 1,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )
    assert response_1.status_code == 201

    response_2 = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 1,
            "client_name": "Bob",
            "starts_at": "2026-04-05T10:30:00",
            "ends_at": "2026-04-05T11:30:00",
        },
    )

    assert response_2.status_code == 409
    assert response_2.get_json() == {
        "error": "session overlaps with existing session"
    }


def test_trainer_can_cancel_own_session(client):
    login(client, "trainer1", "trainer123")

    session_response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 1,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )
    session_id = session_response.get_json()["id"]

    response = client.delete(f"/api/sessions/{session_id}")

    assert response.status_code == 200
    assert response.get_json() == {"status": "deleted"}


def test_trainer_cannot_cancel_other_trainer_session(client):
    login(client, "admin", "admin123")
    session_response = client.post(
        "/api/sessions/",
        json={
            "trainer_id": 2,
            "client_name": "Bob",
            "starts_at": "2026-04-05T12:00:00",
            "ends_at": "2026-04-05T13:00:00",
        },
    )
    session_id = session_response.get_json()["id"]

    login(client, "trainer1", "trainer123")
    response = client.delete(f"/api/sessions/{session_id}")

    assert response.status_code == 403
    assert response.get_json() == {
        "error": "you can only access your own sessions"
    }


def test_trainer_only_sees_own_sessions(client):
    login(client, "admin", "admin123")
    client.post(
        "/api/sessions/",
        json={
            "trainer_id": 1,
            "client_name": "Alice",
            "starts_at": "2026-04-05T10:00:00",
            "ends_at": "2026-04-05T11:00:00",
        },
    )
    client.post(
        "/api/sessions/",
        json={
            "trainer_id": 2,
            "client_name": "Bob",
            "starts_at": "2026-04-05T12:00:00",
            "ends_at": "2026-04-05T13:00:00",
        },
    )

    login(client, "trainer1", "trainer123")
    response = client.get("/api/sessions/")

    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["trainer_id"] == 1
    assert data[0]["client_name"] == "Alice"
