@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado no PATH.
  echo Instale em https://python.org e marque "Add python.exe to PATH" na instalacao,
  echo ou abra index.html direto no navegador ^(o jogo funciona sem a cena 3D nesse caso^).
  pause
  exit /b 1
)

start "Servidor do RPG Tatico - feche esta janela para encerrar o jogo" cmd /k python -m http.server 8731
timeout /t 1 /nobreak >nul
start "" http://localhost:8731/index.html
