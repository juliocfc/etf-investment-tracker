#!/bin/bash

# Copy etf-tracker.db to local.db if it exists
if [ -f "etf-tracker.db" ]; then
  echo "Copying etf-tracker.db to local.db..."
  cp etf-tracker.db local.db
else
  echo "Warning: etf-tracker.db not found. Starting with existing local.db or a new one."
fi

# Run pnpm dev with environment variables
echo "Starting development server with local database..."
DATABASE_URL=file:local.db DATABASE_SYNC_ENABLED=false pnpm dev
