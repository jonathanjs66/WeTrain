from flask import Blueprint, jsonify

bp = Blueprint("healthy", __name__)

@bp.get("/health")
def health():
    return jsonify({"status": "healthy"}), 200