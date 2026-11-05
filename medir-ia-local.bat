@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-ai\Scripts\python.exe" (
  echo Falta el entorno de IA. Ejecuta instalar-ia-local.bat.
  exit /b 1
)
if /I "%~1"=="--avatar" set ANOTHERFACE_SWAPPER=avatar
echo Deten primero el motor start:worker con Ctrl + C.
echo Esta prueba carga el modelo local; no utiliza fotografias.
".venv-ai\Scripts\python.exe" -u local-ai\benchmark.py --samples 3
if errorlevel 1 exit /b 1
endlocal
