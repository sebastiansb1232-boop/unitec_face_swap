@echo off
setlocal
cd /d "%~dp0"
echo Preparando Another Face...
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
if errorlevel 1 goto missing_node
set "ORT_PACKAGE=onnxruntime-directml==1.21.0"
set "AI_RUNTIME=directml"
if /I "%~1"=="--cpu" set "ORT_PACKAGE=onnxruntime==1.21.1"
if /I "%~1"=="--cuda" set "AI_RUNTIME=cuda"
if exist ".venv-ai\Scripts\python.exe" goto validate_env
py -3.12 -c "import sys,struct; assert sys.version_info[:2]==(3,12) and struct.calcsize('P')==8" >nul 2>&1
if errorlevel 1 goto try_python
py -3.12 -m venv .venv-ai
if errorlevel 1 goto failure
goto validate_env
:try_python
python -c "import sys,struct; assert sys.version_info[:2]==(3,12) and struct.calcsize('P')==8" >nul 2>&1
if errorlevel 1 goto missing_python
python -m venv .venv-ai
if errorlevel 1 goto failure
:validate_env
".venv-ai\Scripts\python.exe" -c "import sys,struct; assert sys.version_info[:2]==(3,12) and struct.calcsize('P')==8" >nul 2>&1
if errorlevel 1 goto invalid_env
".venv-ai\Scripts\python.exe" -m pip uninstall -y onnxruntime onnxruntime-directml onnxruntime-gpu
".venv-ai\Scripts\python.exe" -m pip install -r local-ai\requirements-base.txt
if errorlevel 1 goto failure
if /I "%AI_RUNTIME%"=="cuda" (
  echo Instalando CUDA para NVIDIA. Se descargan bibliotecas adicionales...
  ".venv-ai\Scripts\python.exe" -m pip install "onnxruntime-gpu[cuda,cudnn]==1.21.1"
) else (
  ".venv-ai\Scripts\python.exe" -m pip install --force-reinstall --no-deps %ORT_PACKAGE%
)
if errorlevel 1 goto cpu_fallback
goto models
:cpu_fallback
echo El proveedor solicitado no se pudo instalar. Preparando CPU...
".venv-ai\Scripts\python.exe" -m pip uninstall -y onnxruntime-directml onnxruntime-gpu
".venv-ai\Scripts\python.exe" -m pip install --force-reinstall --no-deps onnxruntime==1.21.1
if errorlevel 1 goto failure
:models
".venv-ai\Scripts\python.exe" local-ai\download_models.py
if errorlevel 1 goto failure
call npm.cmd ci
if errorlevel 1 goto failure
echo Listo. Ejecuta iniciar-ia-local.bat o npm.cmd run start:ai.
exit /b 0
:missing_node
echo Falta Node.js 22 o superior con npm. Instala Node.js desde https://nodejs.org/en/download y vuelve a abrir la terminal.
exit /b 1
:missing_python
echo Falta Python 3.12 de 64 bits. Si usas el administrador de Python, ejecuta: py install 3.12
echo Luego vuelve a ejecutar este archivo. Consulta INICIO-RAPIDO.md.
exit /b 1
:invalid_env
echo El entorno .venv-ai no usa Python 3.12 de 64 bits o esta incompleto.
echo Renombra esa carpeta para conservarla y vuelve a ejecutar el instalador con Python 3.12 disponible.
exit /b 1
:failure
echo No se completo la instalacion. Revisa el mensaje anterior y consulta INICIO-RAPIDO.md.
exit /b 1
