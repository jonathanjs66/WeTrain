from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Trainer

bp = Blueprint("trainers", __name__, url_prefix="/api/trainers")

@bp.get("/")
def list_trainers():
    trainers = db.session.scalars(
        db.select(Trainer).order_by(Trainer.id)
    ).all()
    return jsonify(
        [{"id":t.id, "name": t.name} for t in trainers]
        )

@bp.post("/")
def create_trainer():
    data = request.get_json(silent=True) or {}
    raw_name = data.get("name", "")
    if not isinstance(raw_name, str):
        return jsonify({"error": "name must be a string"}), 400
    name = raw_name.strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 120:
        return jsonify({ "error":"name must be below 120 characters"}), 400

    trainer = Trainer(name=name)
    db.session.add(trainer)
    db.session.commit()
    return jsonify({"id": trainer.id, "name": trainer.name}), 201