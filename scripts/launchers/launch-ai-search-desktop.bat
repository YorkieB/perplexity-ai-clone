@echo off
REM Wrapper for Desktop shortcut: builds if needed and starts Electron.
setlocal EnableExtensions
cd /d "%~dp0..\.."
call npm run desktop
set "EXIT=%ERRORLEVEL%"
if not "%EXIT%"=="0" (
  echo.
  echo Desktop launch failed with code %EXIT%.
  pause
)
endlocal & exit /b %EXIT%
