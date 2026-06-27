#!/bin/bash
set -e

DEMO=~/ddd_demo
EXT=~/.vscode/extensions/code-detective-0.3.0

echo "=== Deploy check ==="
ls "$EXT/dist/extension.js" "$EXT/dist/webview/main.js" "$EXT/dist/webview/style.css" "$EXT/media/tree-sitter-python.wasm" > /dev/null
echo "Deploy OK — files present"

echo ""
echo "=== Smoke Test 1: CFG on domain/model.py (Order.add_item) ==="
code --wait --new-window --goto "$DEMO/domain/model.py:71" \
  --command "code-detective.showCfg" \
  "$DEMO" 2>&1 &
PID=$!
sleep 4
kill $PID 2>/dev/null || true
echo "CFG triggered (visual check needed)"

echo ""
echo "=== Smoke Test 2: CFG on main.py (controller.create) ==="
code --wait --new-window --goto "$DEMO/main.py:11" \
  --command "code-detective.showCfg" \
  "$DEMO" 2>&1 &
PID=$!
sleep 4
kill $PID 2>/dev/null || true
echo "CFG main.py triggered"

echo ""
echo "=== Smoke Test 3: ERD full workspace ==="
code --wait --new-window \
  --command "code-detective.showErd" \
  "$DEMO" 2>&1 &
PID=$!
sleep 4
kill $PID 2>/dev/null || true
echo "ERD triggered"

echo ""
echo "=== Smoke Test 4: ERD cursor on class name ==="
code --wait --new-window --goto "$DEMO/domain/model.py:62" \
  --command "code-detective.showErd" \
  "$DEMO" 2>&1 &
PID=$!
sleep 4
kill $PID 2>/dev/null || true
echo "ERD cursor triggered"

echo ""
echo "=== All smoke tests triggered. Check extension logs for errors: ==="
echo "code --locate-extension-host-log 2>/dev/null || echo 'See: ~/.vscode/extensions/code-detective-0.3.0/'"
echo "Open VS Code manually to verify webview renders correctly."
