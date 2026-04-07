# Minimal static file server for local development (no Node/Python required).
param(
  [int]$Port = 8080,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
  ".otf"  = "font/otf"
  ".ttf"  = "font/ttf"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not bind $prefix" -ForegroundColor Red
  Write-Host "Try a different port: .\scripts\dev-server.ps1 -Port 5500" -ForegroundColor Yellow
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "Serving: $Root" -ForegroundColor Green
Write-Host "Open:    http://127.0.0.1:$Port/" -ForegroundColor Cyan
Write-Host "Ctrl+C to stop." -ForegroundColor DarkGray

$rootFull = [System.IO.Path]::GetFullPath($Root)

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $req = $ctx.Request
    $local = [Uri]::UnescapeDataString($req.Url.LocalPath)
    if ($local -eq "/" -or $local -eq "") { $local = "/index.html" }

    $rel = $local.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
    if ($rel -match "\.\.") {
      $res.StatusCode = 400
      continue
    }

    $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
      continue
    }

    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $res.ContentType = "text/plain; charset=utf-8"
      $res.ContentLength64 = $bytes.LongLength
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      continue
    }

    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $ct = $mime[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }

    $bytes = [System.IO.File]::ReadAllBytes($file)
    $res.ContentType = $ct
    $res.ContentLength64 = $bytes.LongLength
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } finally {
    try { $res.OutputStream.Close() } catch {}
    try { $res.Close() } catch {}
  }
}
