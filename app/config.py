from dotenv import load_dotenv
load_dotenv()
import os

class config:
    FLASK_ENV = os.environ.get ("FLASK_ENV", "production")
    DEBUG = FLASK_ENV == "development"
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-only-change-me"
    DATABASE_URL = os.environ.get("DATABASE_URL")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False