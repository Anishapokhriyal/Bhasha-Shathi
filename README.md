# BHASHA-SATHI
## Run
    cd backend && pip install -r requirements.txt && cp ../.env.example .env
    export SARVAM_API_KEY=...   # optional; without it only local models can run
    python run.py               # http://localhost:8000/docs
    cd frontend && npm install && npm run dev
    cd backend && pytest
## Status
Done: auth (JWT, roles), ASR/Translation/TTS adapters (online + offline), Language Memory
(checked before any AI call), WebSocket classroom with per-stage latency, live health check, tests.
Not done: RAG, lessons/quiz/worksheets, analytics, PWA service worker + IndexedDB queue, Offline Center,
Postgres migrations, local Santali TTS.
## Honesty rules baked in
- `mode` = "offline" only when a local model actually ran; otherwise "online". Failures return 503, never fake output.
- Confidence is null (no calibrated score exists). UI shows "AI estimate, unverified".
- Ol Chiki is never transliterated to Devanagari for TTS; if no Santali TTS exists the text is delivered without audio.
- Sarvam endpoints/model support for Santali (translate, TTS) and IndicConformer 'sat' support must be verified
  against current docs before the demo.
