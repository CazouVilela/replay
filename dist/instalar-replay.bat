@echo off
chcp 65001 >nul 2>&1
title Replay - Instalador / Atualizador
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       REPLAY - Instalador/Atualizador    ║
echo  ╚══════════════════════════════════════════╝
echo.

:: === 1. Fechar Replay se estiver rodando ===
echo [1/5] Fechando Replay se estiver rodando...
taskkill /F /IM "Replay.exe" >nul 2>&1
taskkill /F /IM "Replay-0.1.0.exe" >nul 2>&1
timeout /t 2 /nobreak >nul
echo       OK.

:: === 2. Limpar cache do Electron ===
echo [2/5] Limpando cache do Electron...
set "APPDATA_REPLAY=%APPDATA%\replay"

if exist "%APPDATA_REPLAY%\Cache" (
    rmdir /s /q "%APPDATA_REPLAY%\Cache" >nul 2>&1
    echo       Cache removido.
)
if exist "%APPDATA_REPLAY%\Code Cache" (
    rmdir /s /q "%APPDATA_REPLAY%\Code Cache" >nul 2>&1
    echo       Code Cache removido.
)
if exist "%APPDATA_REPLAY%\GPUCache" (
    rmdir /s /q "%APPDATA_REPLAY%\GPUCache" >nul 2>&1
    echo       GPUCache removido.
)
if exist "%APPDATA_REPLAY%\DawnCache" (
    rmdir /s /q "%APPDATA_REPLAY%\DawnCache" >nul 2>&1
)
if exist "%APPDATA_REPLAY%\DawnWebGPUCache" (
    rmdir /s /q "%APPDATA_REPLAY%\DawnWebGPUCache" >nul 2>&1
)
if exist "%APPDATA_REPLAY%\Service Worker" (
    rmdir /s /q "%APPDATA_REPLAY%\Service Worker" >nul 2>&1
    echo       Service Workers removidos.
)
if exist "%APPDATA_REPLAY%\Local Storage" (
    rmdir /s /q "%APPDATA_REPLAY%\Local Storage" >nul 2>&1
    echo       Local Storage removido.
)
if exist "%APPDATA_REPLAY%\Session Storage" (
    rmdir /s /q "%APPDATA_REPLAY%\Session Storage" >nul 2>&1
    echo       Session Storage removido.
)
:: Manter Cookies e Network (sessao do ZenFisio)
echo       Sessao do ZenFisio preservada (cookies).
echo       OK.

:: === 3. Remover .exe antigo ===
echo [3/5] Removendo versao anterior...
set "INSTALL_DIR=%USERPROFILE%\Desktop"
set "DOWNLOAD_DIR=%USERPROFILE%\Downloads"

:: Procurar e remover em locais comuns
for %%D in ("%INSTALL_DIR%" "%DOWNLOAD_DIR%" "%CD%") do (
    if exist "%%~D\Replay-*.exe" (
        del /f /q "%%~D\Replay-*.exe" >nul 2>&1
        echo       Removido de %%~D
    )
)
echo       OK.

:: === 4. Baixar nova versao ===
echo [4/5] Baixando nova versao de replay.sistema.cloud...
set "DEST=%DOWNLOAD_DIR%\Replay.exe"

:: Tentar com curl (Windows 10+)
where curl >nul 2>&1
if %errorlevel%==0 (
    curl -L -o "%DEST%" "https://replay.sistema.cloud/download" --progress-bar
    goto :check_download
)

:: Fallback: PowerShell
powershell -Command "Invoke-WebRequest -Uri 'https://replay.sistema.cloud/download' -OutFile '%DEST%'" 2>nul
if %errorlevel%==0 goto :check_download

:: Fallback: certutil
certutil -urlcache -split -f "https://replay.sistema.cloud/download" "%DEST%" >nul 2>&1

:check_download
if exist "%DEST%" (
    for %%F in ("%DEST%") do echo       Download concluido: %%~nxF (%%~zF bytes^)
    echo       Salvo em: %DEST%
) else (
    echo       ERRO: Download falhou!
    echo       Baixe manualmente: https://replay.sistema.cloud
    pause
    exit /b 1
)
echo       OK.

:: === 5. Limpar temp do portable Electron ===
echo [5/5] Limpando temporarios...
for /d %%D in ("%TEMP%\*Replay*") do (
    rmdir /s /q "%%D" >nul 2>&1
)
for /d %%D in ("%TEMP%\*electron*") do (
    rmdir /s /q "%%D" >nul 2>&1
)
echo       OK.

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         Instalacao concluida!            ║
echo  ║                                          ║
echo  ║  Arquivo: %DEST%
echo  ║                                          ║
echo  ║  Cache limpo, sessao preservada.         ║
echo  ║  Execute o Replay.exe para iniciar.      ║
echo  ╚══════════════════════════════════════════╝
echo.

set /p ABRIR="Deseja abrir o Replay agora? (S/N): "
if /i "%ABRIR%"=="S" (
    start "" "%DEST%"
)

exit /b 0
