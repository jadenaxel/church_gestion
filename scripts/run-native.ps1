[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ProjectRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $ProjectRoot
$env:FORCE_COLOR = '0'
$nominationsRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot '..\NOMBRAMIENTOS'))
$nominationsRunner = Join-Path $nominationsRoot 'scripts\gestionchurch-module.ps1'

try {
  Write-Output "[$(Get-Date -Format o)] Iniciando procesos nativos de GestionChurch."
  if (-not (Test-Path -LiteralPath $nominationsRunner -PathType Leaf)) {
    throw "No se encontro el modulo Nombramientos en $nominationsRoot"
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $nominationsRunner -Action Start -NoPrepare -GestionChurchRoot $ProjectRoot
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el modulo Nombramientos.' }
  & pnpm.cmd start:all
  exit $LASTEXITCODE
}
catch {
  Write-Error "[$(Get-Date -Format o)] ERROR: $($_.Exception.Message)"
  exit 1
}
finally {
  if (Test-Path -LiteralPath $nominationsRunner -PathType Leaf) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $nominationsRunner -Action Stop -GestionChurchRoot $ProjectRoot | Write-Output
  }
}
