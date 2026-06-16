#!/usr/bin/env bash
set -euo pipefail

FLINT_HOME="${FLINT_HOME:-$HOME/.flint}"

echo ""
echo -e "███████╗██╗     ██╗███╗   ██╗████████╗ "
echo -e "██╔════╝██║     ██║████╗  ██║╚══██╔══╝ "
echo -e "█████╗  ██║     ██║██╔██╗ ██║   ██║    "
echo -e "██╔══╝  ██║     ██║██║╚██╗██║   ██║    "
echo -e "██║     ███████╗██║██║ ╚████║   ██║    "
echo -e "╚═╝     ╚══════╝╚═╝╚═╝  ╚═══╝   ╚═╝    "
echo ""


if [ ! -d "$FLINT_HOME" ]; then
  echo "Flint is not installed at $FLINT_HOME."
  exit 0
fi

read -r -p "Keep vault data and local cache for a future reinstall? (y/N): " KEEP_DATA
echo ""

echo "[1/4] Stopping Flint processes"
pkill -f "flint-desktop" 2>/dev/null || true
pkill -f "electron.*flint" 2>/dev/null || true
pkill -f "agent.py" 2>/dev/null || true
echo "      OK  Processes stopped"

echo "[2/4] Removing app menu entry"
rm -f "$HOME/.local/share/applications/flint.desktop"
update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
echo "      OK  App menu entry removed"

echo "[3/4] Removing old system command"
if [ -L "/usr/local/bin/flint" ] || [ -f "/usr/local/bin/flint" ]; then
  rm -f "/usr/local/bin/flint" 2>/dev/null || sudo rm -f "/usr/local/bin/flint" 2>/dev/null || true
fi
echo "      OK  Old command removed"

echo "[4/4] Removing files"
if [[ "$KEEP_DATA" =~ ^[Yy]$ ]]; then
  rm -rf "$FLINT_HOME/app" "$FLINT_HOME/agent" "$FLINT_HOME/source" "$FLINT_HOME/.build" "$FLINT_HOME/bin"
  echo "      OK  Flint app removed. Data kept at $FLINT_HOME"
else
  rm -rf "$FLINT_HOME"
  echo "      OK  Flint removed completely"
fi

echo ""
echo "Flint has been uninstalled."
