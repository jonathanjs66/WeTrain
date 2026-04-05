from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    trainer_id = db.Column(db.Integer, db.ForeignKey("trainers.id"), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Trainer(db.Model):
    __tablename__ = "trainers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)


class Session(db.Model):
    __tablename__ = "sessions"

    id = db.Column(db.Integer, primary_key=True)
    trainer_id = db.Column(db.Integer, db.ForeignKey("trainers.id"), nullable=False)
    client_name = db.Column(db.String(120), nullable=False)
    starts_at = db.Column(db.DateTime, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=False)
