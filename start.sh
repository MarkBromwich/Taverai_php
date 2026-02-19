#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/Desktop/food_app"
cd "$APP_DIR"

echo ""
echo "🚀 Starting Taverai..."
echo "--------------------------------------"

# Open OrbStack if not running
if ! docker info >/dev/null 2>&1; then
  echo "🔄 Opening OrbStack..."
  open -a "OrbStack"
fi

# Wait for Docker
echo "⏳ Waiting for Docker..."
until docker info >/dev/null 2>&1; do
  sleep 0.5
done
echo "✅ Docker ready"

# Start containers
echo "🐳 Starting containers..."
docker compose up -d

# Show running containers
echo ""
echo "📦 Active containers:"
docker compose ps
echo ""

echo "🌐 Starting Next dev server..."
echo "App:     http://localhost:3000"
echo "Adminer: http://localhost:8080"
echo ""

npm run dev