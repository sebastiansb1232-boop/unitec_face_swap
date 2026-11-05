@echo off
setlocal
cd /d "%~dp0"
call instalar-ia-local.bat %*
if errorlevel 1 exit /b 1
echo Optimizacion lista. Inicia con npm.cmd run start:ai.
