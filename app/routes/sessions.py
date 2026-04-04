from datetime import datetime
from app.auth import get_current_role, get_current_trainer_id, require_trainer_or_admin
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Session, Trainer

bp = Blueprint("sessions", __name__, url_prefix="/api/sessions")


@bp.get("/")
def list_sessions():
    role = get_current_role()

    if role == "admin":
        q = db.select(Session).order_by(Session.starts_at)
    elif role == "trainer":
        current_trainer_id = get_current_trainer_id()
        if current_trainer_id is None:
            return jsonify({"error": "trainer id required"}), 403

        q = db.select(Session).where(
            Session.trainer_id == current_trainer_id
        ).order_by(Session.starts_at)
    else:
        return jsonify({"error": "authentication required"}), 403

    sessions = db.session.scalars(q).all()
    return jsonify(
        [
            {
                "id": s.id,
                "trainer_id": s.trainer_id,
                "client_name": s.client_name,
                "starts_at": s.starts_at.isoformat(),
                "ends_at": s.ends_at.isoformat(),
            }
            for s in sessions
        ]
    )



@bp.post("/")
def create_session():
    data = request.get_json(silent=True) or {}
    trainer_id = data.get("trainer_id")
    client_name = (data.get("client_name") or "").strip()
    starts_raw = data.get("starts_at")
    ends_raw = data.get("ends_at")

    if trainer_id is None or not client_name or not starts_raw or not ends_raw:
        return jsonify(
            {"error": "trainer_id, client_name, starts_at, ends_at are required"}
        ), 400

    try:
        trainer_id = int(trainer_id)
    except (TypeError, ValueError):
        return jsonify({"error": "trainer_id must be an integer"}), 400

    auth_error = require_trainer_or_admin(trainer_id)
    if auth_error:
        return auth_error

    trainer = db.session.get(Trainer, trainer_id)
    if trainer is None:
        return jsonify({"error": "trainer not found"}), 404

    try:
        starts_at = datetime.fromisoformat(starts_raw)
        ends_at = datetime.fromisoformat(ends_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "starts_at and ends_at must be ISO datetimes"}), 400

    if ends_at <= starts_at:
        return jsonify({"error": "ends_at must be after starts_at"}), 400

    overlapping = db.session.scalars(
        db.select(Session).where(
            Session.trainer_id == trainer_id,
            Session.starts_at < ends_at,
            Session.ends_at > starts_at,
        )
    ).first()
    if overlapping:
        return jsonify({"error": "session overlaps with existing session"}), 409

    session = Session(
        trainer_id=trainer_id,
        client_name=client_name,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    db.session.add(session)
    db.session.commit()
    return (
        jsonify(
            {
                "id": session.id,
                "trainer_id": session.trainer_id,
                "client_name": session.client_name,
                "starts_at": session.starts_at.isoformat(),
                "ends_at": session.ends_at.isoformat(),
            }
        ),
        201,
    )
