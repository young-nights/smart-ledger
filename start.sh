#!/bin/bash
# Smart Ledger - Start backend and frontend

PROJECT_DIR="/home/whites/.openclaw/workspace/projects/smart-ledger"
BACKEND_LOG="/tmp/smart-ledger-backend.log"
FRONTEND_LOG="/tmp/smart-ledger-frontend.log"

# Kill existing processes
kill $(lsof -ti :5050 2>/dev/null) 2>/dev/null
kill $(lsof -ti :5173 2>/dev/null) 2>/dev/null
sleep 1

# Start backend
cd "$PROJECT_DIR"
nohup python3 api.py > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
for i in {1..10}; do
  if curl -s http://localhost:5050/api/stocks > /dev/null 2>&1; then
    echo "Backend ready"
    break
  fi
  sleep 0.5
done

# Start frontend
cd "$PROJECT_DIR/web"
nohup npm run dev -- --host > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"
echo "Frontend: http://localhost:5173"
