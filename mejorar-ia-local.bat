@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-ai\Scripts\python.exe" (
  echo Primero ejecuta instalar-ia-local.bat en esta carpeta.
  exit /b 1
)
echo Another Face - HyperSwap 1C, 256 pixeles nativos.
echo Descarga adicional de 403 MB. Reutiliza el entorno y los modelos existentes.
echo Licencia ResearchRAIL-MS. Consulta IA-LOCAL.md.
".venv-ai\Scripts\python.exe" -u local-ai\download_models.py --portrait
if errorlevel 1 (
  echo No se completo la mejora. Revisa el mensaje anterior.
  exit /b 1
)
echo Listo. Reinicia el motor con iniciar-intercambio-ia.bat.
echo Debe aparecer hyperswap_1c_256. No cambia la clave de .env.ai.
endlocal
