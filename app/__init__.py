
from flask import Flask
from app.extensions import db
import logging

from app.config import config


def create_app():
    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO)
    app.logger.setLevel(logging.INFO) 
    app.config.from_object(config)
    db.init_app(app)
    from app.routes.health import bp as health_bp
    from app.routes.trainers import bp as trainers_bp
    app.register_blueprint(health_bp)
    app.register_blueprint(trainers_bp)
    from app.routes.sessions import bp as sessions_bp
    app.register_blueprint(sessions_bp)
    from app import models
    with app.app_context(): 
        db.create_all()


    return app