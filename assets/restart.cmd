@echo off
rem dsh-chrome-desktop: restart the DSH backend and reopen the app window.
rem Closing the app window does NOT stop the backend; this is the deliberate way.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1" %*
if errorlevel 1 (
  echo.
  echo Restart failed. See "%~dp0launch.log" for details.
  pause
)
