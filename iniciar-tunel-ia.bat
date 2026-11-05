@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.ai" (
  echo Primero ejecuta npm.cmd run setup:remote y npm.cmd run start:worker.
  exit /b 1
)
node scripts/check-ai-worker.js
if errorlevel 1 exit /b 1
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo Falta cloudflared. Consulta MIGRAR-RENDER.md para instalarlo.
  exit /b 1
)
echo El motor debe indicar que esta protegido antes de continuar.
echo Copia la URL HTTPS trycloudflare.com que aparecera y guardala en ANOTHERFACE_AI_URL de Render.
echo Este tunel es temporal: la URL cambia al reiniciarlo. Deja esta terminal abierta.
cloudflared tunnel --url http://127.0.0.1:8766
