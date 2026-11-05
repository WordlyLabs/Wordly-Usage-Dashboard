#!/bin/bash
# One-time setup: installs the app and adds the "wordly" shortcut command.
cd "$(dirname "$0")"
npm install --no-fund --no-audit
if ! grep -q 'alias wordly=' ~/.bashrc 2>/dev/null; then
  echo 'alias wordly='"'"'pkill -f "node server.js" 2>/dev/null; cd ~/wordly-dashboard-bq && npm start'"'"'' >> ~/.bashrc
fi
echo ""
echo "Setup done. From now on, just type:  wordly"
echo "Then open Web Preview > Preview on port 8080."
