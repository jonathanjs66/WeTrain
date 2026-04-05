from flask import Blueprint, jsonify, request, session

from app.extensions import db
from app.models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    user = db.session.scalar(db.select(User).where(User.username == username))
    if user is None or not user.check_password(password):
        return jsonify({"error": "invalid credentials"}), 401

    session["user_id"] = user.id
    session["role"] = user.role
    session["trainer_id"] = user.trainer_id

    return (
        jsonify(
            {
                "message": "login successful",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "trainer_id": user.trainer_id,
                },
            }
        ),
        200,
    )


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"message": "logout successful"}), 200


@bp.get("/me")
def me():
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify({"authenticated": False}), 200

    user = db.session.get(User, user_id)
    if user is None:
        session.clear()
        return jsonify({"authenticated": False}), 200

    return (
        jsonify(
            {
                "authenticated": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "trainer_id": user.trainer_id,
                },
            }
        ),
        200,
    )
