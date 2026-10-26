@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto checkbundled
where npm >nul 2>nul
if not errorlevel 1 goto standard
:checkbundled
set "ARENA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%ARENA_NODE%" goto bundled
echo Install Node.js LTS, then run this file again.
pause
exit /b 1
:standard
if exist node_modules\typescript\bin\tsc goto launch
call npm install
if errorlevel 1 goto failed
:launch
call npm start
goto done
:bundled
if not exist node_modules\typescript\bin\tsc goto missing
"%ARENA_NODE%" scripts\build.mjs
if errorlevel 1 goto failed
"%ARENA_NODE%" dist\server.js
goto done
:missing
echo Dependencies missing. Install Node.js LTS and run npm install.
goto failed
:failed
echo The server could not start. See the error above.
pause
exit /b 1
:done
pause
