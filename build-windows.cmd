@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64
if errorlevel 1 exit /b %errorlevel%
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if "%1"=="package" (
  npm run tauri build
) else (
  cargo check --manifest-path src-tauri\Cargo.toml
)
