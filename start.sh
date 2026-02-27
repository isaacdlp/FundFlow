#!/bin/bash
export FLASK_PORT=8000

python server/python/app.py &
FLASK_PID=$!

sleep 1

npm run dev &
NODE_PID=$!

trap "kill $FLASK_PID $NODE_PID 2>/dev/null" EXIT

wait
