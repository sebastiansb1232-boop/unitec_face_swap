@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-ai\Scripts\python.exe" (
  echo Primero ejecuta instalar-ia-local.bat.
  exit /b 1
)
echo Another Face - Avatar LivePortrait, salida de 512 pixeles.
echo Descarga adicional: 338 MB. Reutiliza el entorno y ArcFace existentes.
echo Consulta los terminos y las limitaciones en MEJORAS-RETRATO.md.
".venv-ai\Scripts\python.exe" -u local-ai\download_models.py --avatar
if errorlevel 1 exit /b 1
echo Listo. Deten el motor anterior e inicia iniciar-avatar-ia.bat.
endlocal
