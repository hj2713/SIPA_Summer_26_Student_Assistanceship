#!/bin/bash
set -e

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"
BACKEND_PYTHON="$BACKEND_DIR/venv/bin/python"

echo "=== Starting Backend and Frontend Servers ==="

# 1. Stop existing servers first to prevent port conflicts
"$BASE_DIR/scripts/stop.sh"

# 2. Start Backend in background
if [ ! -x "$BACKEND_PYTHON" ]; then
  echo "❌ Backend virtual environment not found or invalid at: $BACKEND_DIR/venv"
  echo "👉 Run ./scripts/setup.sh to create it."
  exit 1
fi

echo "🚀 Starting Backend on http://localhost:8000..."
cd "$BACKEND_DIR"
"$BACKEND_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload > "$BASE_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID). Logs are at backend.log"

# 3. Start Frontend in background
echo "🚀 Starting Frontend on http://localhost:5173..."
cd "$FRONTEND_DIR"
npm run dev > "$BASE_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID). Logs are at frontend.log"

echo ""
echo "🎉 Both servers are launching!"
echo "👉 Frontend: http://localhost:5173"
echo "👉 Backend API Docs: http://localhost:8000/docs"
echo "👉 To stop servers, run: ./scripts/stop.sh"
