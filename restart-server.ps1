# Script para reiniciar el servidor backend
Write-Host "Deteniendo procesos de Node.js..." -ForegroundColor Yellow

# Detener procesos de node que puedan estar corriendo en el puerto 3000
$processes = Get-Process -Name node -ErrorAction SilentlyContinue
if ($processes) {
    $processes | ForEach-Object {
        Write-Host "Deteniendo proceso Node.js (PID: $($_.Id))" -ForegroundColor Yellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "`nIniciando servidor backend..." -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener el servidor`n" -ForegroundColor Cyan

# Cambiar al directorio Back e iniciar el servidor
Set-Location $PSScriptRoot
npm start

