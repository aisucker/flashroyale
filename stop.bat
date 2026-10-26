@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "if (!(Test-Path -LiteralPath '.arena-server.json')) { Write-Host 'Server is not running or was started by an older version.'; exit 0 }; $arenaInfo=Get-Content -LiteralPath '.arena-server.json' -Raw | ConvertFrom-Json; $arenaProc=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$arenaInfo.pid); if ($arenaProc -and $arenaProc.Name -eq 'node.exe' -and $arenaProc.CommandLine -match 'server[.]js' -and [Math]::Abs(($arenaProc.CreationDate.ToUniversalTime()-[DateTime]::Parse($arenaInfo.started).ToUniversalTime()).TotalSeconds) -lt 5) { Stop-Process -Id $arenaInfo.pid; Write-Host 'Arena server stopped.' } else { Write-Host 'Matching Arena process was not found; nothing stopped.' }"
pause
