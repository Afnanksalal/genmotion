#!/usr/bin/env sh
set -eu

need_command() { command -v "$1" >/dev/null 2>&1; }

install_runtime() {
  if need_command brew; then
    brew install node@22 ffmpeg
    brew link --overwrite node@22 >/dev/null 2>&1 || true
  elif need_command apt-get; then
    need_command curl || { sudo apt-get update && sudo apt-get install -y curl; }
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get update
    sudo apt-get install -y nodejs ffmpeg
  elif need_command dnf; then
    need_command curl || sudo dnf install -y curl
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
    sudo dnf install -y nodejs ffmpeg
  else
    echo "Install Node.js 22+, FFmpeg, ffprobe, and curl, then rerun this installer." >&2
    exit 1
  fi
}

if ! need_command node || ! need_command npm || ! need_command ffmpeg || ! need_command ffprobe || ! need_command curl; then
  install_runtime
fi

node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 22 ]; then
  echo "Node.js 22+ is required; found $(node --version)." >&2
  exit 1
fi

tag=$(curl -fsSL https://api.github.com/repos/Afnanksalal/genmotion/releases/latest | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$tag" ]; then
  echo "Could not resolve the latest Genmotion release." >&2
  exit 1
fi

npm install --global "git+https://github.com/Afnanksalal/genmotion.git#$tag"
genmotion doctor
echo "Genmotion $tag installed successfully."
