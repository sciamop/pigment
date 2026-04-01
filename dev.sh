#!/bin/bash
set -e
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "server/node_modules" ]; then
  echo "Installing server dependencies..."
  (cd server && npm install)
fi

if [ ! -d "client/node_modules" ]; then
  echo "Installing client dependencies..."
  (cd client && npm install)
fi

echo ""
echo "  Pigment proxy  →  http://localhost:3035"
echo "  Pigment app    →  http://localhost:5174"
echo ""

# Start both, kill both on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

node server/index.js &
(cd client && npm run dev -- --host) &

wait
