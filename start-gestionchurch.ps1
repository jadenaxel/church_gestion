[CmdletBinding()]
param(
  [ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Logs')]
  [string]$Action = 'Start',

  [ValidateSet('Auto', 'Docker', 'Native')]
  [string]$Mode = 'Auto',

  [switch]$NoBuild,
  # Recovery/verification: preserve existing church records and federation.
  [switch]$SkipDataSetup,
  [switch]$SeedDemo,
  [switch]$Pull,
  [switch]$OpenBrowser,
  [switch]$FollowLogs,

  [ValidateRange(30, 1800)]
  [int]$TimeoutSeconds = 420
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($SkipDataSetup -and $SeedDemo) { throw 'SkipDataSetup y SeedDemo no pueden combinarse.' }
if (($SkipDataSetup -or $SeedDemo) -and $Mode -eq 'Docker') {
  throw 'SkipDataSetup y SeedDemo son opciones del modo Native. No se omiten guardas en Docker.'
}

$ProjectRoot = $PSScriptRoot
$ComposeFile = Join-Path $ProjectRoot 'docker-compose.yml'
$RuntimeRoot = Join-Path $ProjectRoot '.local\runtime'
$NativePidFile = Join-Path $RuntimeRoot 'native.pid'
$NativeLogFile = Join-Path $RuntimeRoot 'native.log'
$NativeErrorLogFile = Join-Path $RuntimeRoot 'native-error.log'
$RuntimeStatusFile = Join-Path $RuntimeRoot 'status.json'
$RuntimeModeFile = Join-Path $RuntimeRoot 'mode.txt'
$NativeRunner = Join-Path $ProjectRoot 'scripts\run-native.ps1'
$NominationsRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot '..\NOMBRAMIENTOS'))
$NominationsRunner = Join-Path $NominationsRoot 'scripts\gestionchurch-module.ps1'
$ProjectName = 'gestionchurch'
$AppUrl = 'http://localhost:3000'
$GatewayReadyUrl = 'http://localhost:4000/health/ready'
$NominationsUrl = 'http://localhost:3300'
$NominationsHealthUrl = 'http://127.0.0.1:4100/healthz'
$NominationsWebHealthUrl = 'http://127.0.0.1:3300/healthz'
$script:SelectedMode = $Mode
$script:DockerCommand = $null
$script:NodeCommand = $null
$script:PnpmCommand = $null

New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

function Add-RuntimePathEntry {
  param([Parameter(Mandatory)][string]$Directory)
  if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return }
  $entries = @($env:PATH -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($entries -notcontains $Directory) { $env:PATH = "$Directory;$env:PATH" }
}

function Get-JavaScriptRuntimeCandidates {
  param([ValidateSet('Node', 'Pnpm')][string]$Kind)

  $candidates = [System.Collections.Generic.List[string]]::new()
  $commandNames = if ($Kind -eq 'Node') { @('node.exe', 'node') } else { @('pnpm.cmd', 'pnpm.exe', 'pnpm') }
  foreach ($name in $commandNames) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) { $candidates.Add($command.Source) }
  }

  $userProfile = [Environment]::GetFolderPath('UserProfile')
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  $appData = [Environment]::GetFolderPath('ApplicationData')
  $programFiles = [Environment]::GetFolderPath('ProgramFiles')
  $nodeDirectory = if ($null -ne $script:NodeCommand) { Split-Path -Parent $script:NodeCommand } else { $null }

  $literalCandidates = if ($Kind -eq 'Node') {
    @(
      (Join-Path $programFiles 'nodejs\node.exe'),
      (Join-Path $localAppData 'Programs\nodejs\node.exe'),
      (Join-Path $userProfile '.volta\bin\node.exe'),
      (Join-Path $appData 'nvm\current\node.exe'),
      'C:\nvm4w\nodejs\node.exe'
    )
  }
  else {
    @(
      (Join-Path $ProjectRoot 'node_modules\.bin\pnpm.cmd'),
      (Join-Path $appData 'npm\pnpm.cmd'),
      (Join-Path $userProfile '.volta\bin\pnpm.cmd'),
      $(if ($nodeDirectory) { Join-Path $nodeDirectory 'pnpm.cmd' } else { $null })
    )
  }
  foreach ($candidate in $literalCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { $candidates.Add([IO.Path]::GetFullPath($candidate)) }
  }

  $wildcardCandidates = if ($Kind -eq 'Node') {
    @(
      (Join-Path $userProfile '.cache\codex-runtimes\*\dependencies\node\bin\node.exe'),
      (Join-Path $appData 'nvm\v*\node.exe'),
      (Join-Path $appData 'fnm\node-versions\v*\installation\node.exe')
    )
  }
  else {
    @(
      (Join-Path $userProfile '.cache\codex-runtimes\*\dependencies\bin\fallback\pnpm.cmd'),
      (Join-Path $userProfile '.cache\codex-runtimes\*\dependencies\node\bin\pnpm.cmd')
    )
  }
  foreach ($pattern in $wildcardCandidates) {
    Get-Item -Path $pattern -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | ForEach-Object { $candidates.Add($_.FullName) }
  }

  return @($candidates | Select-Object -Unique)
}

function Initialize-JavaScriptRuntime {
  $bestNode = $null
  $bestNodeVersion = [version]'0.0.0'
  $detectedNodes = [System.Collections.Generic.List[string]]::new()
  foreach ($candidate in (Get-JavaScriptRuntimeCandidates -Kind Node)) {
    try {
      $rawVersion = (& $candidate -p "process.versions.node").Trim()
      $version = [version]$rawVersion
      $detectedNodes.Add("$candidate (v$rawVersion)")
      if ($version.Major -ge 24 -and $version -gt $bestNodeVersion) {
        $bestNode = $candidate
        $bestNodeVersion = $version
      }
    }
    catch { }
  }
  if (-not $bestNode) {
    $details = if ($detectedNodes.Count) { " Se encontraron: $($detectedNodes -join '; ')." } else { '' }
    throw "No se encontro Node.js 24 o superior. Instale Node.js 24 LTS o inicie GestionChurch desde Codex.$details"
  }
  $script:NodeCommand = $bestNode
  Add-RuntimePathEntry -Directory (Split-Path -Parent $bestNode)

  $bestPnpm = $null
  $bestPnpmVersion = [version]'0.0.0'
  foreach ($candidate in (Get-JavaScriptRuntimeCandidates -Kind Pnpm)) {
    try {
      $rawVersion = (& $candidate --version).Trim()
      $version = [version]$rawVersion
      if ($version.Major -ge 11 -and $version -gt $bestPnpmVersion) {
        $bestPnpm = $candidate
        $bestPnpmVersion = $version
      }
    }
    catch { }
  }
  if (-not $bestPnpm) { throw 'No se encontro pnpm 11 o superior. Instale pnpm 11 o inicie GestionChurch desde Codex.' }
  $script:PnpmCommand = $bestPnpm
  Add-RuntimePathEntry -Directory (Split-Path -Parent $bestPnpm)

  Write-Host "Runtime JavaScript detectado:" -ForegroundColor DarkCyan
  Write-Host "  Node.js: v$bestNodeVersion  ($bestNode)"
  Write-Host "  pnpm:    v$bestPnpmVersion  ($bestPnpm)"
}

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Save-RuntimeStatus {
  param(
    [Parameter(Mandatory)][string]$Status,
    [Parameter(Mandatory)][string]$RuntimeMode,
    [Parameter(Mandatory)][string]$Message
  )

  $payload = [ordered]@{
    status = $Status
    mode = $RuntimeMode
    message = $Message
    updatedAt = (Get-Date).ToString('o')
    applicationUrl = $AppUrl
    nominationsUrl = $NominationsUrl
    healthUrl = $GatewayReadyUrl
  }
  $payload | ConvertTo-Json | Set-Content -LiteralPath $RuntimeStatusFile -Encoding UTF8
}

trap {
  Save-RuntimeStatus -Status 'FAILED' -RuntimeMode $script:SelectedMode -Message $_.Exception.Message
  Write-Host "`nESTADO: FALLO" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "`nConsulte el estado con: .\start-gestionchurch.ps1 -Action Status"
  exit 1
}

function Test-DockerReady {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($null -eq $command) { return $false }

  & $command.Source compose version *> $null
  if ($LASTEXITCODE -ne 0) { return $false }

  & $command.Source info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -ne 0) { return $false }

  $script:DockerCommand = $command.Source
  return $true
}

function Assert-DockerReady {
  if (-not (Test-DockerReady)) {
    throw @'
Docker y Docker Compose v2 no estan disponibles. Inicie Docker Desktop o use
-Mode Native. El modo nativo inicia el Core con PostgreSQL aislado y adaptadores
locales, sin instalar otro PostgreSQL en Windows.
'@
  }
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$IgnoreExitCode
  )

  & $script:DockerCommand compose --project-name $ProjectName --project-directory $ProjectRoot --file $ComposeFile @Arguments
  $exitCode = $LASTEXITCODE
  if (-not $IgnoreExitCode -and $exitCode -ne 0) {
    throw "docker compose termino con codigo $exitCode."
  }
}

function Test-ComposeExists {
  if (-not (Test-DockerReady)) { return $false }
  $containers = & $script:DockerCommand compose --project-name $ProjectName --project-directory $ProjectRoot --file $ComposeFile ps --all --quiet 2>$null
  return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($containers -join ''))
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [string]$ExpectedStatus
  )

  try {
    if ($ExpectedStatus) {
      $response = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 3
      return $response.status -eq $ExpectedStatus
    }
    $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec 3 -UseBasicParsing
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  }
  catch { return $false }
}

function Test-NominationsApiReady {
  try {
    $response = Invoke-RestMethod -Uri $NominationsHealthUrl -Method Get -TimeoutSec 3
    return $response.status -eq 'ok' -and $response.worker.status -eq 'running' -and $response.worker.healthy -eq $true
  }
  catch { return $false }
}

function Test-TcpPort {
  param([int]$Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return $task.Wait(700) -and $client.Connected
  }
  catch { return $false }
  finally { $client.Dispose() }
}

function Get-NativeProcess {
  if (-not (Test-Path -LiteralPath $NativePidFile -PathType Leaf)) { return $null }
  $rawPid = (Get-Content -LiteralPath $NativePidFile -Raw).Trim()
  $processId = 0
  if (-not [int]::TryParse($rawPid, [ref]$processId)) { return $null }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $null }
  if ($process.CommandLine -notlike "*$NativeRunner*") { return $null }
  return $process
}

function Get-SavedMode {
  if (Test-Path -LiteralPath $RuntimeModeFile -PathType Leaf) {
    $saved = (Get-Content -LiteralPath $RuntimeModeFile -Raw).Trim()
    if ($saved -in @('Docker', 'Native')) { return $saved }
  }
  return 'Auto'
}

function Wait-GestionChurch {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastMessageAt = [DateTime]::MinValue

  Write-Step "Esperando GestionChurch y el modulo Nombramientos (maximo $TimeoutSeconds segundos)"
  while ((Get-Date) -lt $deadline) {
    $gatewayReady = Test-HttpEndpoint -Uri $GatewayReadyUrl -ExpectedStatus 'ready'
    $webReady = Test-HttpEndpoint -Uri $AppUrl
    $nominationsApiReady = Test-NominationsApiReady
    $nominationsWebReady = Test-HttpEndpoint -Uri $NominationsWebHealthUrl
    if ($gatewayReady -and $webReady -and $nominationsApiReady -and $nominationsWebReady) { return $true }

    if (((Get-Date) - $lastMessageAt).TotalSeconds -ge 12) {
      $gatewayText = if ($gatewayReady) { 'listo' } else { 'iniciando' }
      $webText = if ($webReady) { 'lista' } else { 'iniciando' }
      $nominationsText = if ($nominationsApiReady -and $nominationsWebReady) { 'listo' } else { 'iniciando' }
      Write-Host "    Gateway: $gatewayText | Web: $webText | Nombramientos: $nominationsText"
      $lastMessageAt = Get-Date
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Show-Endpoints {
  param([string]$RuntimeMode)
  Write-Host "`nESTADO: ARRIBA" -ForegroundColor Green
  Write-Host "  Modo:             $RuntimeMode"
  Write-Host "  Aplicacion:       $AppUrl"
  Write-Host '  API Gateway:      http://localhost:4000'
  Write-Host "  Nombramientos:    $NominationsUrl"
  Write-Host '  API Nombramientos:http://localhost:4100'
  Write-Host '  OpenAPI:          http://localhost:4000/api/docs'
  if ($RuntimeMode -eq 'Docker') {
    Write-Host '  Correo (Mailpit): http://localhost:58025'
    Write-Host '  MinIO:            http://localhost:59001'
    Write-Host '  Jaeger:           http://localhost:16686'
  }
  Write-Host '  PostgreSQL:       127.0.0.1:55432'
  Write-Host "`nEstado:  .\start-gestionchurch.ps1 -Action Status"
  Write-Host 'Logs:    .\start-gestionchurch.ps1 -Action Logs'
  Write-Host 'Detener: .\start-gestionchurch.ps1 -Action Stop'
}

function Show-CurrentStatus {
  $gatewayReady = Test-HttpEndpoint -Uri $GatewayReadyUrl -ExpectedStatus 'ready'
  $webReady = Test-HttpEndpoint -Uri $AppUrl
  $nominationsApiReady = Test-NominationsApiReady
  $nominationsWebReady = Test-HttpEndpoint -Uri $NominationsWebHealthUrl
  $databaseReady = Test-TcpPort -Port 55432
  $nativeProcess = Get-NativeProcess
  $composeExists = Test-ComposeExists
  $savedMode = Get-SavedMode

  if ($gatewayReady -and $webReady -and $nominationsApiReady -and $nominationsWebReady) {
    $status = 'ARRIBA'
    $color = 'Green'
  }
  elseif ($null -ne $nativeProcess -or $composeExists) {
    $status = 'INICIANDO O DEGRADADA'
    $color = 'Yellow'
  }
  else {
    $status = 'DETENIDA'
    $color = 'Red'
  }

  $persistedStatus = if ($gatewayReady -and $webReady -and $nominationsApiReady -and $nominationsWebReady) { 'UP' } elseif ($null -ne $nativeProcess -or $composeExists) { 'DEGRADED' } else { 'DOWN' }
  $statusMessage = "Web=$(if ($webReady) { 'UP' } else { 'DOWN' }); Gateway=$(if ($gatewayReady) { 'UP' } else { 'DOWN' }); NombramientosWeb=$(if ($nominationsWebReady) { 'UP' } else { 'DOWN' }); NombramientosAPI=$(if ($nominationsApiReady) { 'UP' } else { 'DOWN' }); PostgreSQL=$(if ($databaseReady) { 'UP' } else { 'DOWN' })."
  Save-RuntimeStatus -Status $persistedStatus -RuntimeMode $savedMode -Message $statusMessage

  Write-Host "`nESTADO: $status" -ForegroundColor $color
  Write-Host "  Ultimo modo:      $savedMode"
  Write-Host "  Web (3000):       $(if ($webReady) { 'ARRIBA' } else { 'ABAJO' })"
  Write-Host "  Gateway (4000):   $(if ($gatewayReady) { 'ARRIBA' } else { 'ABAJO' })"
  Write-Host "  Nombram. (3300):  $(if ($nominationsWebReady) { 'ARRIBA' } else { 'ABAJO' })"
  Write-Host "  Nom API (4100):   $(if ($nominationsApiReady) { 'ARRIBA' } else { 'ABAJO' })"
  Write-Host "  PostgreSQL:       $(if ($databaseReady) { 'ARRIBA' } else { 'ABAJO' })"
  Write-Host "  Proceso nativo:   $(if ($null -ne $nativeProcess) { "PID $($nativeProcess.ProcessId)" } else { 'NO' })"
  Write-Host "  Stack Docker:     $(if ($composeExists) { 'CREADO' } else { 'NO' })"

  if (Test-Path -LiteralPath $RuntimeStatusFile -PathType Leaf) {
    try {
      $last = Get-Content -LiteralPath $RuntimeStatusFile -Raw | ConvertFrom-Json
      Write-Host "  Ultimo mensaje:   $($last.message)"
      Write-Host "  Actualizado:      $($last.updatedAt)"
    }
    catch {}
  }

  return $gatewayReady -and $webReady -and $nominationsApiReady -and $nominationsWebReady
}

function Ensure-LocalEnvironment {
  $envFile = Join-Path $ProjectRoot '.env'
  $exampleFile = Join-Path $ProjectRoot '.env.example'
  if (Test-Path -LiteralPath $envFile -PathType Leaf) { return }
  if (-not (Test-Path -LiteralPath $exampleFile -PathType Leaf)) {
    throw 'No existe .env ni .env.example.'
  }

  $contents = Get-Content -LiteralPath $exampleFile -Raw
  $randomBytes = [byte[]]::new(36)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $jwtSecret = [Convert]::ToBase64String($randomBytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $internalSecret = [Convert]::ToBase64String($randomBytes)
  $contents = $contents.Replace('replace-with-at-least-32-random-characters', $jwtSecret)
  $contents = $contents.Replace('replace-with-another-random-secret', $internalSecret)
  Set-Content -LiteralPath $envFile -Value $contents -Encoding UTF8
  Write-Host 'Se creo .env con secretos locales aleatorios.'
}

function Assert-NativePrerequisites {
  Initialize-JavaScriptRuntime

  $postgresBin = if ($env:POSTGRES_BIN) { $env:POSTGRES_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
  if (-not (Test-Path -LiteralPath (Join-Path $postgresBin 'pg_ctl.exe') -PathType Leaf)) {
    throw "No se encontro PostgreSQL 18 en '$postgresBin'. Defina POSTGRES_BIN o use Docker Desktop."
  }
}

function Stop-LocalPostgres {
  $dataDirectory = Join-Path $ProjectRoot '.local\postgres\data'
  if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION') -PathType Leaf)) { return }
  $postgresBin = if ($env:POSTGRES_BIN) { $env:POSTGRES_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
  $pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
  if (-not (Test-Path -LiteralPath $pgCtl -PathType Leaf)) { return }

  & $pgCtl status -D $dataDirectory *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'Deteniendo PostgreSQL aislado del proyecto...'
    & $pgCtl stop -D $dataDirectory -m fast -w | Out-Host
  }
}

function Stop-Native {
  if (Test-Path -LiteralPath $NominationsRunner -PathType Leaf) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NominationsRunner -Action Stop -GestionChurchRoot $ProjectRoot | Out-Host
  }
  $process = Get-NativeProcess
  $rootVariants = @($ProjectRoot, $ProjectRoot.Replace('\', '/'))
  $managedProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    if ($_.ProcessId -eq $PID -or [string]::IsNullOrWhiteSpace($_.CommandLine)) { return $false }
    if ($_.Name -notin @('node.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe')) { return $false }
    foreach ($variant in $rootVariants) {
      if ($_.CommandLine.IndexOf($variant, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
  }

  if ($null -ne $process -or @($managedProcesses).Count -gt 0) {
    $rootText = if ($null -ne $process) { " (PID principal $($process.ProcessId))" } else { '' }
    Write-Host "Deteniendo procesos nativos de GestionChurch$rootText..."
    $managedIds = @($managedProcesses | Select-Object -ExpandProperty ProcessId -Unique)
    if ($managedIds.Count -gt 0) {
      Stop-Process -Id $managedIds -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
  }
  if (Test-Path -LiteralPath $NativePidFile -PathType Leaf) {
    Remove-Item -LiteralPath $NativePidFile -Force
  }
  Stop-LocalPostgres
}

function Show-NativeLogTail {
  if (Test-Path -LiteralPath $NativeLogFile -PathType Leaf) {
    Write-Step 'Ultimas lineas del log nativo (salida)'
    Get-Content -LiteralPath $NativeLogFile -Tail 120 | Out-Host
  }
  if ((Test-Path -LiteralPath $NativeErrorLogFile -PathType Leaf) -and (Get-Item -LiteralPath $NativeErrorLogFile).Length -gt 0) {
    Write-Step 'Ultimas lineas del log nativo (errores)'
    Get-Content -LiteralPath $NativeErrorLogFile -Tail 120 | Out-Host
  }
}

function Start-Native {
  $script:SelectedMode = 'Native'
  Set-Content -LiteralPath $RuntimeModeFile -Value 'Native' -Encoding ASCII
  Save-RuntimeStatus -Status 'STARTING' -RuntimeMode 'Native' -Message 'Preparando dependencias nativas.'

  Write-Warning 'Docker no esta disponible. Se iniciara el Core funcional en modo nativo con PostgreSQL aislado. Redis, NATS, MinIO, ClamAV, Mailpit y Jaeger usaran los adaptadores locales/degradados previstos por la aplicacion.'
  Assert-NativePrerequisites
  Ensure-LocalEnvironment

  # Una instancia parcial debe salir antes de reconstruir la aplicacion.
  if ($null -ne (Get-NativeProcess)) { Stop-Native }

  Write-Step 'Instalando/verificando dependencias JavaScript'
  & $script:PnpmCommand install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias JavaScript.' }

  if ($SkipDataSetup -and -not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.local\postgres\data\PG_VERSION') -PathType Leaf)) {
    throw 'SkipDataSetup requiere un cluster local existente. No se creara otra instancia para una verificacion.'
  }
  Write-Step 'Iniciando PostgreSQL aislado existente'
  & $script:PnpmCommand db:bootstrap
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el inicio de PostgreSQL.' }
  if (-not $SkipDataSetup) {
    Write-Step 'Aplicando migraciones compatibles'
    & $script:PnpmCommand db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la migracion de PostgreSQL.' }
    if ($SeedDemo) {
      Write-Step 'Creando datos demostrativos por solicitud explicita (no produccion)'
      & $script:PnpmCommand db:seed
      if ($LASTEXITCODE -ne 0) { throw 'Fallo el seed demostrativo.' }
    }
  }

  if (-not (Test-Path -LiteralPath $NominationsRunner -PathType Leaf)) {
    throw "No se encontro el modulo Nombramientos en '$NominationsRoot'."
  }
  if (-not $SkipDataSetup) {
    Write-Step 'Preparando Nombramientos como modulo federado de GestionChurch'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NominationsRunner -Action Prepare -GestionChurchRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la preparacion del modulo Nombramientos.' }
  }

  if ($NoBuild) { Write-Step 'Verificando el build estable existente (sin reconstruir)' }
  else { Write-Step 'Construyendo la aplicacion estable de produccion' }
  $webRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'apps\web'))
  $nextCache = [IO.Path]::GetFullPath((Join-Path $webRoot '.next'))
  $expectedPrefix = $webRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $nextCache.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta de cache Next.js fuera del proyecto: $nextCache"
  }
  if (-not $NoBuild -and (Test-Path -LiteralPath $nextCache -PathType Container)) {
    Remove-Item -LiteralPath $nextCache -Recurse -Force
  }
  if ($NoBuild) {
    if (-not (Test-Path -LiteralPath (Join-Path $nextCache 'BUILD_ID') -PathType Leaf)) {
      throw 'NoBuild requiere un build existente. Ejecute pnpm build antes de reutilizarlo.'
    }
  }
  else {
    & $script:PnpmCommand build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el build estable de GestionChurch.' }
  }

  Set-Content -LiteralPath $NativeLogFile -Value '' -Encoding UTF8
  Set-Content -LiteralPath $NativeErrorLogFile -Value '' -Encoding UTF8
  $runnerArguments = @(
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $NativeRunner),
    '-ProjectRoot', ('"{0}"' -f $ProjectRoot)
  )
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $runnerArguments -WindowStyle Hidden -RedirectStandardOutput $NativeLogFile -RedirectStandardError $NativeErrorLogFile -PassThru
  Set-Content -LiteralPath $NativePidFile -Value $process.Id -Encoding ASCII
  Start-Sleep -Seconds 2
  if ($process.HasExited) {
    Show-NativeLogTail
    throw "El proceso nativo termino prematuramente con codigo $($process.ExitCode)."
  }

  if (-not (Wait-GestionChurch)) {
    Show-NativeLogTail
    throw 'La aplicacion nativa no alcanzo el estado saludable dentro del tiempo esperado.'
  }

  Save-RuntimeStatus -Status 'UP' -RuntimeMode 'Native' -Message 'GestionChurch y Nombramientos estan saludables.'
  Show-Endpoints -RuntimeMode 'Native'
}

function Start-Docker {
  $script:SelectedMode = 'Docker'
  Assert-DockerReady
  Set-Content -LiteralPath $RuntimeModeFile -Value 'Docker' -Encoding ASCII
  Save-RuntimeStatus -Status 'STARTING' -RuntimeMode 'Docker' -Message 'Construyendo e iniciando el stack completo.'

  # Evita que el PostgreSQL nativo compita con el puerto del contenedor.
  Stop-Native

  if ($Pull) {
    Write-Step 'Descargando imagenes actualizadas'
    Invoke-Compose -Arguments @('pull', '--ignore-buildable')
  }

  Write-Step 'Iniciando los servicios de GestionChurch, incluido el microservicio de reportes'
  $upArguments = @('up', '--detach', '--remove-orphans')
  if (-not $NoBuild) { $upArguments += '--build' }
  Invoke-Compose -Arguments $upArguments

  if (-not (Wait-GestionChurch)) {
    Write-Step 'Estado de contenedores'
    Invoke-Compose -Arguments @('ps') -IgnoreExitCode
    Write-Step 'Ultimos logs de la aplicacion'
    Invoke-Compose -Arguments @('logs', '--tail', '120', 'setup', 'identity', 'tenant', 'calendar', 'files', 'notification', 'reports', 'elders', 'gateway', 'web') -IgnoreExitCode
    throw 'El stack Docker no alcanzo el estado saludable dentro del tiempo esperado.'
  }

  Save-RuntimeStatus -Status 'UP' -RuntimeMode 'Docker' -Message 'Todos los servicios requeridos estan iniciados; Web y Gateway saludables.'
  Show-Endpoints -RuntimeMode 'Docker'
}

function Stop-All {
  $stoppedSomething = $false
  if (Test-ComposeExists) {
    Write-Step 'Deteniendo el stack Docker (los volumenes se conservan)'
    Invoke-Compose -Arguments @('down', '--remove-orphans')
    $stoppedSomething = $true
  }

  if ($null -ne (Get-NativeProcess) -or (Test-TcpPort -Port 55432)) {
    Write-Step 'Deteniendo el modo nativo'
    Stop-Native
    $stoppedSomething = $true
  }

  Save-RuntimeStatus -Status 'DOWN' -RuntimeMode (Get-SavedMode) -Message 'Aplicacion detenida; datos conservados.'
  if ($stoppedSomething) {
    Write-Host "`nESTADO: DETENIDA. Los datos se conservaron." -ForegroundColor Green
  }
  else {
    Write-Host "`nESTADO: DETENIDA. No habia procesos activos." -ForegroundColor Yellow
  }
}

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) { throw "No se encontro $ComposeFile." }
if (-not (Test-Path -LiteralPath $NativeRunner -PathType Leaf)) { throw "No se encontro $NativeRunner." }

Push-Location $ProjectRoot
try {
  if ($Action -eq 'Status') {
    $healthy = Show-CurrentStatus
    if (-not $healthy) { exit 3 }
    exit 0
  }

  if ($Action -eq 'Logs') {
    if (Test-ComposeExists) {
      Write-Step 'Logs Docker (Ctrl+C para salir)'
      Invoke-Compose -Arguments @('logs', '--follow', '--tail', '150')
    }
    elseif (Test-Path -LiteralPath $NativeLogFile -PathType Leaf) {
      Write-Step 'Log nativo (Ctrl+C para salir)'
      if ((Test-Path -LiteralPath $NativeErrorLogFile -PathType Leaf) -and (Get-Item -LiteralPath $NativeErrorLogFile).Length -gt 0) {
        Write-Host 'Errores recientes:' -ForegroundColor Yellow
        Get-Content -LiteralPath $NativeErrorLogFile -Tail 80 | Out-Host
        Write-Host "`nSalida en vivo:" -ForegroundColor Cyan
      }
      Get-Content -LiteralPath $NativeLogFile -Tail 150 -Wait
    }
    else {
      throw 'No existen logs porque la aplicacion no ha sido iniciada.'
    }
    exit 0
  }

  if ($Action -eq 'Stop') {
    Stop-All
    exit 0
  }

  if ($Action -eq 'Restart') {
    if ($Mode -eq 'Auto') { $Mode = Get-SavedMode }
    Stop-All
  }

  if ((Test-HttpEndpoint -Uri $GatewayReadyUrl -ExpectedStatus 'ready') -and (Test-HttpEndpoint -Uri $AppUrl) -and (Test-NominationsApiReady) -and (Test-HttpEndpoint -Uri $NominationsWebHealthUrl)) {
    $activeMode = Get-SavedMode
    Save-RuntimeStatus -Status 'UP' -RuntimeMode $activeMode -Message 'La aplicacion ya estaba saludable.'
    Show-Endpoints -RuntimeMode $activeMode
  }
  else {
    if ($Mode -eq 'Docker') {
      Start-Docker
    }
    elseif ($Mode -eq 'Native') {
      Start-Native
    }
    elseif ($Mode -eq 'Auto') {
      Start-Native
    }
  }

  if ($OpenBrowser) { Start-Process $AppUrl }

  if ($FollowLogs) {
    if ($script:SelectedMode -eq 'Docker') {
      Invoke-Compose -Arguments @('logs', '--follow', '--tail', '100')
    }
    else {
      Get-Content -LiteralPath $NativeLogFile -Tail 100 -Wait
    }
  }
}
finally {
  Pop-Location
}
