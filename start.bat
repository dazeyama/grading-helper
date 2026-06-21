@echo off
REM Start Grading Helper (static JS app) on a local web server, open it, then wait for SPACE to stop.
cd /d "%~dp0"
echo Starting Grading Helper on http://localhost:8090 ...

REM Free the port first in case a previous server is still running.
call "%~dp0stop.bat" >nul 2>&1

start "grading-helper" python -m http.server 8090 --directory "%~dp0"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8090"
echo.
echo Grading Helper is running at http://localhost:8090
echo (Edit the files and just refresh your browser with Ctrl+F5 to see changes.)
echo.
echo Press SPACE to end program.

:wait
powershell -NoProfile -Command "while($true){ $k=[Console]::ReadKey($true).Key; if($k -eq 'Spacebar'){exit 0} }"

:stop
echo.
echo Stopping...
call "%~dp0stop.bat"
