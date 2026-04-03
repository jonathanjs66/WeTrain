
from flask import Flask
from app.extensions import db

from app.config import config


def create_app():
    app = Flask(__name__) 
    app.config.from_object(config)
    db.init_app(app)
    from app.routes.health import bp as health_bp
    from app.routes.trainers import bp as trainers_bp
    app.register_blueprint(health_bp)
    app.register_blueprint(trainers_bp)
    from app import models
    with app.app_context(): 
        db.create_all()


    return app