@echo off
echo ==================================================
echo      POORDOWN.OI - PUBLIC ACCESS LAUNCHER
echo ==================================================
echo.

echo 1. Checking for Nginx...
tasklist /FI "IMAGENAME eq nginx.exe" 2>NUL | find /I /N "nginx.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Nginx is running.
) else (
    echo [!] Nginx is NOT running. 
    echo     Please go to your Downloads folder:
    echo     C:\Users\prosh\Downloads\nginx-1.29.4\nginx-1.29.4
    echo     And run nginx.exe
    echo.
    pause
    exit /b
)

echo 2. Launching Ngrok Tunnel...
echo    Target: http://localhost:8080
echo.

where ngrok >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 'ngrok' command not found!
    echo.
    echo Please follow these steps:
    echo 1. Download ngrok from: https://ngrok.com/download
    echo 2. Unzip it.
    echo 3. Run: ngrok config add-authtoken YOUR_TOKEN
    echo 4. Run checking this script again OR manually run: 
    echo    ngrok http 8080
    echo.
    pause
    exit /b
)

echo Starting Ngrok...
echo Share the "Forwarding" URL (e.g. https://xxxx.ngrok-free.app) with your friends!
echo.
ngrok http 8080
pause
