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

release_json=$(curl -fsSL https://api.github.com/repos/Afnanksalal/genmotion/releases/latest)
release_data=$(printf '%s' "$release_json" | node -e '
let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => {
  const release = JSON.parse(input); const pkg = release.assets.find(asset => asset.name.endsWith(".tgz")); const sums = release.assets.find(asset => asset.name === "SHA256SUMS");
  if (!release.tag_name || !pkg || !sums) process.exit(2);
  process.stdout.write([release.tag_name, pkg.name, pkg.browser_download_url, sums.browser_download_url].join("\n"));
});') || { echo "The latest Genmotion release does not contain a verified install package." >&2; exit 1; }
tag=$(printf '%s\n' "$release_data" | sed -n '1p')
package_name=$(printf '%s\n' "$release_data" | sed -n '2p')
package_url=$(printf '%s\n' "$release_data" | sed -n '3p')
checksums_url=$(printf '%s\n' "$release_data" | sed -n '4p')

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT INT TERM
curl -fsSL "$package_url" -o "$scratch/$package_name"
curl -fsSL "$checksums_url" -o "$scratch/SHA256SUMS"
expected=$(awk -v name="$package_name" '$2 == name || $2 == "*" name { print $1; exit }' "$scratch/SHA256SUMS")
if [ -z "$expected" ]; then echo "Package checksum is missing." >&2; exit 1; fi
if need_command sha256sum; then
  actual=$(sha256sum "$scratch/$package_name" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$scratch/$package_name" | awk '{print $1}')
fi
if [ "$actual" != "$expected" ]; then echo "Genmotion package checksum verification failed." >&2; exit 1; fi
npm install --global "$scratch/$package_name"
genmotion doctor
echo "Genmotion $tag installed successfully."
