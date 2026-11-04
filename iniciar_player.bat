@echo off
title Canal+ Web Player
cd /d "%~dp0"
echo ==============================================
echo    INICIANDO CANAL+ WEB PLAYER LOCAL
echo ==============================================
echo.
echo Abrindo em http://localhost:3000 ...
echo.
start http://localhost:3000
"C:\Program Files\nodejs\node.exe" server.js
pause
