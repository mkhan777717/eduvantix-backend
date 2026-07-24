# DMX Academy — AI Proctoring Microservice

Production-ready, advisory AI-assisted online exam proctoring service.
Built with Python 3.12, FastAPI, OpenCV, MediaPipe FaceMesh, SQLAlchemy, and PostgreSQL.

> **IMPORTANT**: This system is **advisory only**. It never automatically fails, suspends, or terminates an exam. All flags are stored for instructor review.

---

## Key Features

1. **Advisory-Only Monitoring**: Consent modal, non-intrusive floating camera preview, auto-dismiss toast alerts.
2. **WebSocket Primary Channel**: Binary JPEG frames with adaptive sampling (3s normal → 1s burst on active flag → 3s after 5s cooldown). REST fallback included.
3. **Detector Plugin Registry**: Priority-ordered execution (`FaceDetector` P1 → `HeadPoseDetector` P2 → `LightingDetector` P3 → `MouthDetector` P4 → `BlurDetector` P5) with short-circuit rules (e.g. `NO_FACE` skips head pose & mouth).
4. **MediaPipe Singleton**: Initialized ONCE at app startup via FastAPI lifespan; reused across all requests.
5. **asyncio.Queue Worker Pool**: 500ms max queue wait before frame drop; prevents request pileup under high load.
6. **Sustained Event Aggregation**: Writes **one DB row per event** with `duration_s` and `frame_count`, not one per frame.
7. **Adaptive Threshold Calibration**: Measures baseline brightness during the first 15 seconds of each session.
8. **Thumbnail Storage**: 640×360 px max JPEG thumbnails saved for flagged frames (>80% smaller than 1080p).
9. **Instructor Report Dashboard**: Compressed timeline, advisory risk score (0–100), filter bar (severity, flag type, duration, image presence).
10. **Distributed Trace IDs**: End-to-end `trace_id` tracking from client → Node.js proxy → FastAPI → DB rows.

---

## Setup & Running

### Requirements
- Python 3.10+ (3.12 recommended)
- OpenCV dependencies (installed automatically via `requirements.txt`)
- PostgreSQL database (shared with main backend)

### Installation
```bash
cd proctor
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` matches your PostgreSQL connection string.

### Running Locally
```bash
uvicorn main:app --port 8001 --reload
```
The service will start on `http://127.0.0.1:8001`.
- OpenAPI Docs: `http://127.0.0.1:8001/api/v1/proctor/docs`
- Health Check: `http://127.0.0.1:8001/api/v1/proctor/health`
- Metrics: `http://127.0.0.1:8001/api/v1/proctor/metrics`

---

## Production Deployment (Gunicorn / Uvicorn)

```bash
gunicorn main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8001 \
  --timeout 60 \
  --keepalive 5 \
  --max-requests 1000 \
  --max-requests-jitter 100
```

### Nginx Reverse Proxy Snippet
```nginx
location /api/v1/proctor/ws/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}

location /api/v1/proctor/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## Architecture Summary

```
Student Browser (Next.js)
  │ (WSS / REST fallback)
  ▼
Node.js Express Gateway (port 5472) — JWT Auth
  │ (HTTP Proxy / Direct WSS)
  ▼
FastAPI Proctoring Sidecar (port 8001)
  ├── Lifespan (MediaPipe FaceMesh Singleton)
  ├── asyncio.Queue (N Worker Tasks)
  ├── DetectorRegistry (Priority P1..P5 + Short-Circuit)
  ├── CalibrationService (15s Baseline)
  ├── StorageService (640x360 Thumbnails)
  └── PostgreSQL Database (ProctorSession, ProctorConnection, ProctorAIEvent)
```
