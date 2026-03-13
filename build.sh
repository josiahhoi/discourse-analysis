#!/bin/bash
# Build Discourse Analysis into one-click executables for Mac and Windows.
# Requires Node.js (https://nodejs.org). Run: ./build.sh

set -e
cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install

echo ""
echo "Building Mac app..."
npm run build:mac

echo ""
echo "Building Windows app..."
npm run build:win

echo ""
echo "Done. Your builds are in the dist/ folder:"
ls -la dist/ 2>/dev/null || true
