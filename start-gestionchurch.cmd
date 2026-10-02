@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-gestionchurch.ps1" -OpenBrowser %*
set "GC_EXIT=%errorlevel%"
if not "%GC_EXIT%"=="0" (
  if "%~1"=="" (
    echo.
    echo El inicio no se completo. La ventana permanecera abierta para que pueda leer el error.
    pause
  )
)
popd
exit /b %GC_EXIT%
