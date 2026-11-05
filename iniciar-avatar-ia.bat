@echo off
setlocal
cd /d "%~dp0"
set ANOTHERFACE_SWAPPER=avatar
call npm.cmd run start:worker
endlocal
