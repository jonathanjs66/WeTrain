from flask import Blueprint, jsonify
from sqlalchemy import text

from app.extensions import db

bp = Blueprint('ready', __name__)



@bp.get('/ready')
def ready():
    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        return jsonify({"status": "error", "database": "unreachable"}), 503

    return jsonify({"status": "ok", "database": "reachable"}), 200