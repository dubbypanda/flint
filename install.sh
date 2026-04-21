#!/bin/bash
# ============================================================
#  Flint — Local-first Knowledge Base
#  Install Script v1.0.0
# ============================================================

set -e

FLINT_DIR="$HOME/.flint"
FLINT_BIN="/usr/local/bin/flint"
REPO_URL="https://github.com/Chintanpatel24/flint.git"

echo ""
echo "  ███████╗██╗      █████╗ ███████╗"
echo "  ██╔════╝██║     ██╔══██╗██╔════╝"
echo "  █████╗  ██║     ███████║███████╗"
echo "  ██╔══╝  ██║     ██╔══██║╚════██║"
echo "  ██║     ███████╗██║  ██║███████║"
echo "  ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝"
echo ""
echo "  Install Script v1.0.0"
echo "  ─────────────────────────────"
echo ""

# Check dependencies
echo "[1/6] Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js is not installed."
    echo "    Install it from: https://nodejs.org"
    exit 1
fi
echo "  ✓ Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
    echo "  ✗ npm is not installed."
    exit 1
fi
echo "  ✓ npm $(npm -v)"

if ! command -v git &> /dev/null; then
    echo "  ✗ git is not installed."
    exit 1
fi
echo "  ✓ git $(git --version | cut -d' ' -f3)"

echo ""
echo "[2/6] Setting up Flint directory..."

# Create Flint home directory
mkdir -p "$FLINT_DIR"
mkdir -p "$FLINT_DIR/vaults"
mkdir -p "$FLINT_DIR/config"
mkdir -p "$FLINT_DIR/backups"

echo "  ✓ Created $FLINT_DIR"
echo "  ✓ Created $FLINT_DIR/vaults"
echo "  ✓ Created $FLINT_DIR/config"

echo ""
echo "[3/6] Cloning Flint repository..."

if [ -d "$FLINT_DIR/repo" ]; then
    echo "  Repository already exists. Pulling latest..."
    cd "$FLINT_DIR/repo"
    git pull origin main 2>/dev/null || true
else
    git clone "$REPO_URL" "$FLINT_DIR/repo" 2>/dev/null || {
        # If repo doesn't exist, copy from current directory
        echo "  Cloning from local source..."
        CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"
        mkdir -p "$FLINT_DIR/repo"
        cp -r "$CURRENT_DIR/." "$FLINT_DIR/repo/" 2>/dev/null || true
    }
fi

echo "  ✓ Repository ready"

echo ""
echo "[4/6] Building Flint..."

cd "$FLINT_DIR/repo"

# Install dependencies
npm install --silent 2>/dev/null || npm install

# Build the project
npm run build

echo "  ✓ Build complete"

echo ""
echo "[5/6] Installing Flint CLI..."

# Create the launcher script
cat > "$FLINT_DIR/flint-launcher.sh" << 'LAUNCHER'
#!/bin/bash
# Flint Launcher
FLINT_DIR="$HOME/.flint/repo"
FLINT_PORT="${FLINT_PORT:-4200}"

cd "$FLINT_DIR"

echo "Starting Flint on http://localhost:$FLINT_PORT"
echo "Press Ctrl+C to stop"
echo ""

# Try to use serve or python to host the built files
if command -v npx &> /dev/null; then
    npx serve dist -l "$FLINT_PORT" --no-clipboard
elif command -v python3 &> /dev/null; then
    cd dist
    python3 -m http.server "$FLINT_PORT"
elif command -v python &> /dev/null; then
    cd dist
    python -m SimpleHTTPServer "$FLINT_PORT"
else
    echo "Error: No suitable HTTP server found."
    echo "Install serve: npm install -g serve"
    exit 1
fi
LAUNCHER

chmod +x "$FLINT_DIR/flint-launcher.sh"

# Create symlink
if [ -w /usr/local/bin ]; then
    ln -sf "$FLINT_DIR/flint-launcher.sh" "$FLINT_BIN" 2>/dev/null || {
        echo "  ! Cannot write to /usr/local/bin. Using ~/.local/bin instead."
        mkdir -p "$HOME/.local/bin"
        ln -sf "$FLINT_DIR/flint-launcher.sh" "$HOME/.local/bin/flint"
        echo "  Make sure ~/.local/bin is in your PATH"
    }
else
    mkdir -p "$HOME/.local/bin"
    ln -sf "$FLINT_DIR/flint-launcher.sh" "$HOME/.local/bin/flint"
    echo "  Installed to ~/.local/bin/flint"
fi

echo "  ✓ CLI installed"

echo ""
echo "[6/6] Creating default config..."

# Create config file
cat > "$FLINT_DIR/config/settings.json" << 'CONFIG'
{
  "version": "1.0.0",
  "theme": "matte-black",
  "autoSave": true,
  "autoSaveDelay": 800,
  "defaultViewMode": "edit",
  "graphPhysics": {
    "repulsion": 4000,
    "attraction": 0.005,
    "damping": 0.85,
    "centerGravity": 0.0003
  }
}
CONFIG

echo "  ✓ Config created"

# Record installation
echo "$(date -Iseconds)" > "$FLINT_DIR/.installed"
echo "1.0.0" > "$FLINT_DIR/.version"

echo ""
echo "  ─────────────────────────────"
echo "  ✓ Flint installed successfully!"
echo ""
echo "  Usage:"
echo "    flint          Start Flint"
echo "    flint --port 8080   Use custom port"
echo ""
echo "  Data stored in: $FLINT_DIR"
echo "  Config: $FLINT_DIR/config/settings.json"
echo "  Vaults: $FLINT_DIR/vaults/"
echo ""
echo "  To update:  bash update.sh"
echo "  To uninstall: bash uninstall.sh"
echo ""
