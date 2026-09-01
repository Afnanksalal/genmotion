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
$package = $release.assets | Where-Object { $_.name -like '*.tgz' } | Select-Object -First 1
$checksums = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS' } | Select-Object -First 1
if (-not $release.tag_name -or -not $package -or -not $checksums) { throw 'The latest Genmotion release does not contain a verified install package.' }

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("genmotion-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
  $archive = Join-Path $scratch $package.name
  $checksumFile = Join-Path $scratch 'SHA256SUMS'
  Invoke-WebRequest -UseBasicParsing $package.browser_download_url -OutFile $archive
  Invoke-WebRequest -UseBasicParsing $checksums.browser_download_url -OutFile $checksumFile
  $expected = ((Get-Content -LiteralPath $checksumFile | Where-Object { $_ -match [regex]::Escape($package.name) } | Select-Object -First 1) -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  if (-not $expected -or $actual -ne $expected) { throw 'Genmotion package checksum verification failed.' }
  npm install --global $archive
  genmotion doctor
  Write-Host "Genmotion $($release.tag_name) installed successfully." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
