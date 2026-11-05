@echo off
setlocal
cd /d "%~dp0"
set "ANOTHERFACE_SWAPPER=auto"
echo Another Face - intercambio neuronal sobre la camara.
echo Prioriza HyperSwap 256 cuando esta instalado; usa InSwapper si falta.
call npm.cmd run start:worker
endlocal
