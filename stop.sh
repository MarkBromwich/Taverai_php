#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/Desktop/food_app"
cd "$APP_DIR"

echo ""
echo "🛑 Shutting down Taverai..."
echo "--------------------------------------"

docker compose down

echo "✅ Containers stopped"
echo ""