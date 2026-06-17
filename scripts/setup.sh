#!/bin/bash
set -e

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Setting up Agentic RAG Masterclass ==="

# 1. Setup Backend env
echo "👉 Setting up backend environment..."
cd "$BASE_DIR/backend"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created backend/.env from .env.example (please fill in your keys!)"
else
  echo "ℹ️ backend/.env already exists."
fi

# Create python virtual environment
if [ ! -d venv ]; then
  echo "👉 Creating Python virtual environment..."
  python3 -m venv venv
  echo "✅ Created virtual environment."
fi

echo "👉 Installing backend dependencies..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
echo "✅ Backend dependencies installed."

# 2. Setup Frontend env
echo "👉 Setting up frontend environment..."
cd "$BASE_DIR/frontend"
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
