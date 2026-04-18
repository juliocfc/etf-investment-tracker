#!/bin/bash

# Configuration
APP_DIR="$HOME/projects/etf-investment-tracker"
PLIST_NAME="com.etf.tracker.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"
PORT=3001
REAL_HOME=$HOME

echo "🚀 Starting background service setup on port $PORT..."

# 1. Build the application
echo "📦 Building application for production..."
cd "$APP_DIR"
# Use absolute path for pnpm
/opt/homebrew/bin/pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check errors above."
    exit 1
fi

if [ ! -f "dist/index.js" ]; then
    echo "❌ Build succeeded but dist/index.js was not found. Please check build output."
    exit 1
fi

# 2. Create logs directory
mkdir -p "$APP_DIR/logs"

# 3. Process and Copy plist to LaunchAgents
echo "📄 Preparing and Installing Launch Agent..."
# Create a version of the plist with absolute paths
# Also ensures the WorkingDirectory is correct and sets the PORT
sed -e "s|\$HOME|$REAL_HOME|g" -e "s|\$PORT|$PORT|g" "$APP_DIR/$PLIST_NAME" > "$PLIST_PATH"

# 4. Load the service
echo "🔄 Loading service..."
# Unload if exists
launchctl bootout gui/$(id -u)/com.etf.tracker 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null

# Load using the modern bootstrap command
echo "🚀 Bootstrapping service..."
launchctl bootstrap gui/$(id -u) "$PLIST_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Setup complete! The app is now running in the background."
    echo "📈 You can check logs at: $APP_DIR/logs/out.log"
    echo "♻️ It will automatically start when you restart your computer."
    echo "🔗 Try accessing: http://localhost:$PORT"
else
    echo "❌ Failed to bootstrap service. Falling back to old load command..."
    launchctl load "$PLIST_PATH"
    if [ $? -eq 0 ]; then
        echo "✅ Setup complete (via fallback)! The app should be running."
    else
        echo "❌ Critical error: Failed to load service."
        exit 1
    fi
fi
