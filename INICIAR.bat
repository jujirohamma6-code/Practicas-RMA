@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo [ERROR] No se encontro Electron en la carpeta node_modules.
  echo.
  echo Ejecuta primero este comando en la carpeta del proyecto:
  echo     npm install
  echo.
  pause
  exit /b 1
)

echo Iniciando Cornavex...
start "" "node_modules\electron\dist\electron.exe" .
