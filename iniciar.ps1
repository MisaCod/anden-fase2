# Script rápido para levantar Backend (FastAPI :8000) y Frontend (Vite :5182)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Iniciando backend FastAPI en http://127.0.0.1:8000 ..." -ForegroundColor Cyan
$backend = Start-Process -FilePath "$root\backend\.venv\Scripts\python.exe" `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" `
  -WorkingDirectory "$root\backend" -PassThru

Write-Host "Iniciando frontend Vite en http://localhost:5182 ..." -ForegroundColor Green
try {
  Push-Location $root
  npm run dev
} finally {
  Pop-Location
  if ($backend -and !$backend.HasExited) {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
  }
}
