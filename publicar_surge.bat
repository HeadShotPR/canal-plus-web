@echo off
title Publicar Canal+ (HTTP para Smart TV)
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ==============================================
echo  Publicando em http://canalplus-tv.surge.sh
echo  Na primeira vez: digite um e-mail e crie uma senha.
echo ==============================================
call npx --yes surge ./ canalplus-tv.surge.sh
echo.
echo Pronto! Abra na TV: http://canalplus-tv.surge.sh
pause
