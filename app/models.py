from app.extensions import db

class Trainer(db.Model):
    __tablename__ = "trainers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)