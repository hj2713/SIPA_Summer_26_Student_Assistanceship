#!/bin/bash

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Starting Backend and Frontend Servers ==="

# 1. Stop existing servers first to prevent port conflicts
"$BASE_DIR/scripts/stop.sh"

# 2. Start Backend in background
echo "🚀 Starting Backend on http://localhost:8000..."
cd "$BASE_DIR/backend"
./venv/bin/uvicorn app.main:app --port 8000 --reload > "$BASE_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID). Logs are at backend.log"

# 3. Start Frontend in background
echo "🚀 Starting Frontend on http://localhost:5173..."
cd "$BASE_DIR/frontend"
npm run dev > "$BASE_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID). Logs are at frontend.log"

echo ""
echo "🎉 Both servers are launching!"
echo "👉 Frontend: http://localhost:5173"
echo "👉 Backend API Docs: http://localhost:8000/docs"
echo "👉 To stop servers, run: ./scripts/stop.sh"
