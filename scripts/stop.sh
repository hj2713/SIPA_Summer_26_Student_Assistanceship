#!/bin/bash

echo "=== Stopping Running Backend and Frontend Servers ==="

# Find and kill backend running on port 8000
BACKEND_PIDS=$(lsof -t -i :8000 2>/dev/null)
if [ -n "$BACKEND_PIDS" ]; then
  echo "Stopping backend processes (PIDs: $BACKEND_PIDS) on port 8000..."
  kill $BACKEND_PIDS
  echo "✅ Backend stopped."
else
  echo "ℹ️ No backend running on port 8000."
fi

# Find and kill frontend running on port 5173
FRONTEND_PIDS=$(lsof -t -i :5173 2>/dev/null)
if [ -n "$FRONTEND_PIDS" ]; then
  echo "Stopping frontend processes (PIDs: $FRONTEND_PIDS) on port 5173..."
  kill $FRONTEND_PIDS
  echo "✅ Frontend stopped."
else
  echo "ℹ️ No frontend running on port 5173."
fi
