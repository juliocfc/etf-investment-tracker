#!/bin/bash

# Configuration
APP_DIR="$HOME/projects/etf-investment-tracker"
PLIST_NAME="com.etf.tracker.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "🚀 Starting background service setup..."

# 1. Build the application
echo "📦 Building application for production..."
cd "$APP_DIR"
pnpm build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check errors above."
    exit 1
fi

# 2. Create logs directory
mkdir -p "$APP_DIR/logs"

# 3. Copy plist to LaunchAgents
echo "📄 Installing Launch Agent..."
cp "$APP_DIR/$PLIST_NAME" "$PLIST_PATH"

# 4. Load the service
echo "🔄 Loading service..."
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ Setup complete! The app is now running in the background."
echo "📈 You can check logs at: $APP_DIR/logs/out.log"
echo "♻️ It will automatically start when you restart your computer."
