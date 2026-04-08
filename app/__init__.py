import logging
import sys
import time
from pathlib import Path

from flask import Flask, g, jsonify, request

from app.extensions import db, migrate
from app.config import config


def create_app(test_config=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    logging.basicConfig(level=logging.INFO)
    app.logger.setLevel(logging.INFO)
    app.config.from_object(config)

    if test_config is not None:
        app.config.update(test_config)

    db.init_app(app)
    migrate.init_app(app, db)

    @app.before_request
    def log_request():
        g.request_start_time = time.perf_counter()
        app.logger.info(
            "request_started method=%s path=%s",
            request.method,
            request.path,
        )

    @app.after_request
    def log_response(response):
        duration_ms = (time.perf_counter() - g.request_start_time) * 1000
        app.logger.info(
            "request_finished method=%s path=%s status=%s duration_ms=%.2f",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
        return response


    from app.routes.health import bp as health_bp
    from app.routes.trainers import bp as trainers_bp
    from app.routes.auth import bp as auth_bp
    from app.routes.sessions import bp as sessions_bp
    from app.routes.ready import bp as ready_bp


    app.register_blueprint(health_bp)
    app.register_blueprint(trainers_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(ready_bp)
    app.register_blueprint(sessions_bp)

    from app import models

    is_migration_command = "db" in sys.argv

    with app.app_context():
        from app.models import Trainer, User

        if not app.config.get("TESTING") and not is_migration_command:
            db.create_all()

            admin_user = db.session.scalar(
                db.select(User).where(User.username == "admin")
            )
            if admin_user is None:
                admin_user = User(username="admin", role="admin")
                admin_user.set_password("admin123")
                db.session.add(admin_user)

            trainer = db.session.scalar(
                db.select(Trainer).where(Trainer.name == "Default Trainer")
            )
            if trainer is None:
                trainer = Trainer(name="Default Trainer")
                db.session.add(trainer)
                db.session.flush()

            trainer_user = db.session.scalar(
                db.select(User).where(User.username == "trainer1")
            )
            if trainer_user is None:
                trainer_user = User(
                    username="trainer1",
                    role="trainer",
                    trainer_id=trainer.id,
                )
                trainer_user.set_password("trainer123")
                db.session.add(trainer_user)

            db.session.commit()

    @app.route("/")
    def index():
        return Path(app.static_folder, "index.html").read_text(encoding="utf-8")

    @app.errorhandler(Exception)
    def handle_error(error):
        app.logger.exception(
            "unhandled_error method=%s path=%s",
            request.method,
            request.path,
        )
        return jsonify({"error": "Internal server error"}), 500


    return app
