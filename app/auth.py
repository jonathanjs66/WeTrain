from flask import jsonify, session


def get_current_role():
    return session.get("role")


def get_current_trainer_id():
    return session.get("trainer_id")


def require_admin():
    role = get_current_role()
    if role != "admin":
        return jsonify({"error": "admin access required"}), 403
    return None


def require_trainer_or_admin(trainer_id=None):
    role = get_current_role()

    if role == "admin":
        return None

    if role != "trainer":
        return jsonify({"error": "authentication required"}), 403

    current_trainer_id = get_current_trainer_id()
    if current_trainer_id is None:
        return jsonify({"error": "trainer id required"}), 403

    if trainer_id is not None and current_trainer_id != trainer_id:
        return jsonify({"error": "you can only access your own sessions"}), 403

    return None
