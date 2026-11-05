@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-ai\Scripts\python.exe" (
  echo Primero ejecuta instalar-ia-local.bat para crear el entorno.
  exit /b 1
)
".venv-ai\Scripts\python.exe" local-ai\download_models.py --background
if errorlevel 1 exit /b 1
echo LaMa listo. Reinicia el motor de IA y usa Generar fondo con IA en la pagina.
endlocal
