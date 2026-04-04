
from flask import Flask, jsonify, request, render_template_string
from app.extensions import db
import logging

from app.config import config


def create_app(test_config=None):
    app = Flask(__name__, static_folder='static', static_url_path='/static')
    logging.basicConfig(level=logging.INFO)
    app.logger.setLevel(logging.INFO) 
    if test_config is not None:
        app.config.update(test_config)
    else:
        app.config.from_object(config)
    db.init_app(app)
    @app.before_request
    def log_request():
        app.logger.info(f"{request.method} {request.path}")
    @app.after_request
    def log_response(response):
        app.logger.info(f"Response status: {response.status}")
        return response
    
    from app.routes.health import bp as health_bp
    from app.routes.trainers import bp as trainers_bp
    app.register_blueprint(health_bp)
    app.register_blueprint(trainers_bp)
    from app.routes.sessions import bp as sessions_bp
    app.register_blueprint(sessions_bp)
    
    from app import models
    with app.app_context(): 
        db.create_all()
    
    @app.route('/')
    def index():
        with open('app/static/index.html', 'r') as f:
            return f.read()
    @app.errorhandler(Exception)
    def handle_error(error):
        app.logger.error(f"Unhandled error: {error}")
        return jsonify({"error": "Internal server error"}), 500
    return app