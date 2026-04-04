# Trainer Scheduling App

A minimal Flask backend for trainer scheduling.

## Setup and Run

1. Ensure Docker and Docker Compose are installed.
2. Run: `docker compose up --build`
3. The app will be available at http://localhost:5000
4. Health check: GET /health

## API Endpoints

- GET /health: Returns {"status": "ok"}
- GET /api/trainers: List trainers
- POST /api/trainers: Create trainer (JSON: {"name": "string"})
- GET /api/sessions: List sessions
- POST /api/sessions: Create session (JSON: {"trainer_id": int, "client_name": "string", "starts_at": "ISO datetime", "ends_at": "ISO datetime"})