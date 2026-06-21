@echo off
REM Stop the Grading Helper local server and free port 8090.
set "FOUND="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8090 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "FOUND=1"
)
if defined FOUND (
    echo Stopped grading-helper and freed port 8090.
) else (
    echo Nothing was listening on port 8090.
)
