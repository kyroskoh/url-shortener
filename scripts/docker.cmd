@echo off
REM Thin wrapper so cmd.exe / double-click callers can use the PowerShell script.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker.ps1" %*
exit /b %ERRORLEVEL%
