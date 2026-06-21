#!/bin/bash
set -e

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"
BACKEND_PYTHON="$BACKEND_DIR/venv/bin/python"

echo "=== Setting up Law Delegation ==="

# 1. Setup Backend env
echo "👉 Setting up backend environment..."
cd "$BACKEND_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created backend/.env from .env.example (please fill in your keys!)"
else
  echo "ℹ️ backend/.env already exists."
fi

# Create python virtual environment
if [ ! -x "$BACKEND_PYTHON" ]; then
  echo "👉 Creating Python virtual environment..."
  python3 -m venv venv
  echo "✅ Created virtual environment."
fi

echo "👉 Installing backend dependencies..."
"$BACKEND_PYTHON" -m pip install --upgrade pip
"$BACKEND_PYTHON" -m pip install -r requirements.txt
echo "✅ Backend dependencies installed."

# 2. Setup Frontend env
echo "👉 Setting up frontend environment..."
cd "$FRONTEND_DIR"
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✅ Created frontend/.env.local from .env.example (please fill in your keys!)"
else
  echo "ℹ️ frontend/.env.local already exists."
fi

echo "👉 Installing frontend dependencies..."
npm install
echo "✅ Frontend dependencies installed."

echo ""
echo "🎉 Setup complete! Next steps:"
echo "1. Fill in your API keys in 'backend/.env' and 'frontend/.env.local'"
echo "2. Run './scripts/start.sh' to launch the servers!"
