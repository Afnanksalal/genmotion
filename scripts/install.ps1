$ErrorActionPreference = 'Stop'

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22+ is required. Install it from https://nodejs.org and rerun this installer.'
  }
  winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw "Node.js 22+ is required; found $(node --version)." }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'FFmpeg and ffprobe are required. Install FFmpeg and rerun this installer.'
  }
  winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

$release = Invoke-RestMethod 'https://api.github.com/repos/Afnanksalal/genmotion/releases/latest'
$tag = $release.tag_name
if (-not $tag) { throw 'Could not resolve the latest Genmotion release.' }
npm install --global "git+https://github.com/Afnanksalal/genmotion.git#$tag"
genmotion doctor
Write-Host "Genmotion $tag installed successfully." -ForegroundColor Green
