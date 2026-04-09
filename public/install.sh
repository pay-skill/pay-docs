#!/bin/sh
# pay CLI installer — https://pay-skill.com
# Usage: curl -fsSL https://pay-skill.com/install.sh | sh
set -e

REPO="pay-skill/pay-cli"
INSTALL_DIR="${PAY_INSTALL_DIR:-$HOME/bin}"

get_arch() {
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac
}

get_os() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    linux) echo "linux" ;;
    darwin) echo "macos" ;;
    *) echo "Unsupported OS: $os (use install.ps1 for Windows)" >&2; exit 1 ;;
  esac
}

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": *"//;s/".*//'
}

main() {
  OS=$(get_os)
  ARCH=$(get_arch)
  VERSION=$(get_latest_version)
  BINARY="pay-${OS}-${ARCH}"
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY}"

  echo "Installing pay ${VERSION} (${OS}/${ARCH})..."

  mkdir -p "$INSTALL_DIR"
  curl -fsSL "$URL" -o "${INSTALL_DIR}/pay"
  chmod +x "${INSTALL_DIR}/pay"

  echo "Installed pay to ${INSTALL_DIR}/pay"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "Add to your PATH:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi

  echo ""
  "${INSTALL_DIR}/pay" --version 2>/dev/null || true
}

main
