@echo off
setlocal
cd /d "%~dp0"
py -m pip install -r requirements.txt
py -m PyInstaller --noconfirm --clean --onefile --windowed --name Devin --hidden-import speech_recognition devin.py
echo.
echo Build complete: %CD%\dist\Devin.exe
endlocal
