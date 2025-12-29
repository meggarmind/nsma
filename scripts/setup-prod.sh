#!/bin/bash
# ============================================================================
# NSMA Production Setup Script
# ============================================================================
# Sets up a production instance of NSMA with systemd services
#
# Usage: ./setup-prod.sh [options]
#
# Options:
#   --install-dir=PATH    Installation directory (default: ~/apps/nsma-prod)
#   --port=PORT           Web server port (default: 5100)
#   --instance=NAME       Instance name (default: prod)
#   --config-dir=PATH     Config directory (default: ~/.notion-sync-manager)
#   --repo-url=URL        Git repository URL (default: origin URL from dev)
#   --branch=BRANCH       Git branch to use (default: master)
#   --skip-clone          Skip git clone (for updating existing install)
#   --skip-build          Skip npm install and build
#   --help                Show this help
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="${HOME}/apps/nsma-prod"
PORT="5100"
INSTANCE="prod"
CONFIG_DIR="${HOME}/.notion-sync-manager"
REPO_URL=""
BRANCH="master"
SKIP_CLONE=false
SKIP_BUILD=false

# Get script directory (where setup-prod.sh lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --install-dir=*)
      INSTALL_DIR="${arg#*=}"
      ;;
    --port=*)
      PORT="${arg#*=}"
      ;;
    --instance=*)
      INSTANCE="${arg#*=}"
      ;;
    --config-dir=*)
      CONFIG_DIR="${arg#*=}"
      ;;
    --repo-url=*)
      REPO_URL="${arg#*=}"
      ;;
    --branch=*)
      BRANCH="${arg#*=}"
      ;;
    --skip-clone)
      SKIP_CLONE=true
      ;;
    --skip-build)
      SKIP_BUILD=true
      ;;
    --help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# If no repo URL provided, try to get it from dev directory
if [ -z "$REPO_URL" ]; then
  if [ -d "$DEV_DIR/.git" ]; then
    REPO_URL=$(cd "$DEV_DIR" && git config --get remote.origin.url 2>/dev/null || echo "")
  fi
  if [ -z "$REPO_URL" ]; then
    echo -e "${RED}Error: No --repo-url provided and could not detect from dev directory${NC}"
    exit 1
  fi
fi

# Expand ~ in paths (handles cases where ~ doesn't expand in quoted args)
expand_path() {
  local path="$1"
  # If path starts with ~, expand it
  if [[ "$path" == "~"* ]]; then
    path="${path/#\~/$HOME}"
  fi
  echo "$path"
}

# Resolve paths to absolute (with ~ expansion)
INSTALL_DIR=$(realpath -m "$(expand_path "$INSTALL_DIR")")
CONFIG_DIR=$(realpath -m "$(expand_path "$CONFIG_DIR")")

# Find Node.js path
NODE_PATH=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_PATH" ]; then
  echo -e "${RED}Error: Node.js not found in PATH${NC}"
  exit 1
fi

# Systemd user directory
SYSTEMD_DIR="${HOME}/.config/systemd/user"

# Print banner
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           ${GREEN}NSMA Production Setup${BLUE}                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Install directory: $INSTALL_DIR"
echo "  Port:              $PORT"
echo "  Instance:          $INSTANCE"
echo "  Config directory:  $CONFIG_DIR"
echo "  Repository:        $REPO_URL"
echo "  Branch:            $BRANCH"
echo "  Node path:         $NODE_PATH"
echo ""

# Confirm
read -p "Proceed with setup? (y/N) " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

echo ""

# Step 1: Clone or update repository
if [ "$SKIP_CLONE" = false ]; then
    echo -e "${BLUE}[1/6]${NC} Cloning/updating repository..."
    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "  Directory exists, pulling latest..."
        cd "$INSTALL_DIR"
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        echo "  Cloning fresh copy..."
        mkdir -p "$(dirname "$INSTALL_DIR")"
        git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    echo -e "  ${GREEN}✓${NC} Repository ready"
else
    echo -e "${BLUE}[1/6]${NC} Skipping clone (--skip-clone)"
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}Error: Install directory does not exist: $INSTALL_DIR${NC}"
        exit 1
    fi
    cd "$INSTALL_DIR"
fi

# Step 2: Install dependencies
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo -e "${BLUE}[2/6]${NC} Installing dependencies..."
    npm install --production=false
    echo -e "  ${GREEN}✓${NC} Dependencies installed"

    # Step 3: Build application
    echo ""
    echo -e "${BLUE}[3/6]${NC} Building application..."
    npm run build
    echo -e "  ${GREEN}✓${NC} Build complete"
else
    echo ""
    echo -e "${BLUE}[2/6]${NC} Skipping npm install (--skip-build)"
    echo -e "${BLUE}[3/6]${NC} Skipping build (--skip-build)"
fi

# Step 4: Create systemd directory
echo ""
echo -e "${BLUE}[4/6]${NC} Setting up systemd services..."
mkdir -p "$SYSTEMD_DIR"

# Step 5: Generate daemon service
DAEMON_SERVICE="$SYSTEMD_DIR/nsma-daemon-${INSTANCE}.service"
cat > "$DAEMON_SERVICE" << EOF
[Unit]
Description=NSMA Sync Daemon (${INSTANCE})
After=network.target

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=NOTION_SYNC_CONFIG_DIR=${CONFIG_DIR}
Environment=NSMA_INSTANCE=${INSTANCE}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_PATH} cli/index.js --daemon
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
echo -e "  ${GREEN}✓${NC} Created daemon service: nsma-daemon-${INSTANCE}.service"

# Generate web service
WEB_SERVICE="$SYSTEMD_DIR/nsma-web-${INSTANCE}.service"
cat > "$WEB_SERVICE" << EOF
[Unit]
Description=NSMA Web App (${INSTANCE})
After=network.target nsma-daemon-${INSTANCE}.service
Wants=nsma-daemon-${INSTANCE}.service

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=NOTION_SYNC_CONFIG_DIR=${CONFIG_DIR}
Environment=NSMA_INSTANCE=${INSTANCE}
Environment=ALLOWED_ORIGINS=localhost:${PORT}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_PATH} ${INSTALL_DIR}/node_modules/.bin/next start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
echo -e "  ${GREEN}✓${NC} Created web service: nsma-web-${INSTANCE}.service"

# Step 6: Enable and start services
echo ""
echo -e "${BLUE}[5/6]${NC} Enabling services..."
systemctl --user daemon-reload
systemctl --user enable "nsma-daemon-${INSTANCE}.service" 2>/dev/null || true
systemctl --user enable "nsma-web-${INSTANCE}.service" 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Services enabled"

echo ""
echo -e "${BLUE}[6/6]${NC} Starting services..."
systemctl --user restart "nsma-daemon-${INSTANCE}.service" 2>/dev/null || \
  systemctl --user start "nsma-daemon-${INSTANCE}.service"
systemctl --user restart "nsma-web-${INSTANCE}.service" 2>/dev/null || \
  systemctl --user start "nsma-web-${INSTANCE}.service"
echo -e "  ${GREEN}✓${NC} Services started"

# Enable lingering (services run without login)
echo ""
echo "Enabling user lingering (services run at boot)..."
loginctl enable-linger "$USER" 2>/dev/null && \
  echo -e "  ${GREEN}✓${NC} User lingering enabled" || \
  echo -e "  ${YELLOW}Note:${NC} loginctl not available, services may not start at boot"

# Print completion message
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo -e "NSMA Production is now running at:"
echo -e "  ${GREEN}http://localhost:${PORT}${NC}"
echo ""
echo -e "${YELLOW}Service commands:${NC}"
echo "  systemctl --user status nsma-daemon-${INSTANCE}"
echo "  systemctl --user status nsma-web-${INSTANCE}"
echo "  systemctl --user restart nsma-web-${INSTANCE}"
echo "  journalctl --user -u nsma-web-${INSTANCE} -f"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open http://localhost:${PORT}/settings"
echo "  2. Configure Notion integration (if not already done)"
echo "  3. Set a registration token (needed for self-updates)"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
