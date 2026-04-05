# WeTrain

A minimal trainer scheduling app built with Flask, PostgreSQL, Docker, and basic CI.

## Features

- Flask app factory pattern
- PostgreSQL with SQLAlchemy
- `/health` endpoint
- Trainer and session APIs
- Session overlap prevention
- Basic role-based access control using request headers
- Frontend calendar for admin and trainer views
- Automated tests with `pytest`
- GitHub Actions CI

## Environment Variables

Create a `.env` file in the project root.

Example:

```env
FLASK_ENV=development
SECRET_KEY=replace-me-with-a-random-string
DATABASE_URL=postgresql://user:password@db:5432/trainer_app
DB_USER=user
DB_PASSWORD=password
DB_NAME=trainer_app
