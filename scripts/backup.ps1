param(
  [string]$OutputDirectory = "",
  [string]$TenantSlug = "",
  [switch]$IncludeConfiguration,
  [string]$ConfigurationFile = "",
  [string]$EncryptionPassphrase = $env:GC_BACKUP_PASSPHRASE
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'postgres-process.ps1')
if (-not ('System.Security.Cryptography.AesGcm' -as [type])) { throw 'El backup cifrado requiere PowerShell 7. Ejecute pwsh -File scripts/backup.ps1.' }
if ([string]::IsNullOrWhiteSpace($EncryptionPassphrase) -or $EncryptionPassphrase.Length -lt 16) {
  throw 'Defina GC_BACKUP_PASSPHRASE con al menos 16 caracteres. Los backups sin cifrar no están permitidos.'
}

function Protect-BackupFile {
  param([Parameter(Mandatory=$true)][string]$InputPath, [Parameter(Mandatory=$true)][string]$Passphrase, [switch]$KeepInput)
  $salt = [byte[]]::new(16)
  $nonce = [byte[]]::new(12)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($nonce)
  $kdf = [System.Security.Cryptography.Rfc2898DeriveBytes]::new($Passphrase, $salt, 200000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  try { $key = $kdf.GetBytes(32) } finally { $kdf.Dispose() }
  $plain = [System.IO.File]::ReadAllBytes($InputPath)
  $cipher = [byte[]]::new($plain.Length)
  $tag = [byte[]]::new(16)
  $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
  try { $aes.Encrypt($nonce, $plain, $cipher, $tag) } finally { $aes.Dispose(); [Array]::Clear($key, 0, $key.Length); [Array]::Clear($plain, 0, $plain.Length) }
  $outputPath = "$InputPath.gcbak"
  $header = [System.Text.Encoding]::ASCII.GetBytes('GCBAK1')
  $output = [byte[]]::new($header.Length + $salt.Length + $nonce.Length + $tag.Length + $cipher.Length)
  [Array]::Copy($header, 0, $output, 0, $header.Length)
  [Array]::Copy($salt, 0, $output, $header.Length, $salt.Length)
  [Array]::Copy($nonce, 0, $output, $header.Length + $salt.Length, $nonce.Length)
  [Array]::Copy($tag, 0, $output, $header.Length + $salt.Length + $nonce.Length, $tag.Length)
  [Array]::Copy($cipher, 0, $output, $header.Length + $salt.Length + $nonce.Length + $tag.Length, $cipher.Length)
  [System.IO.File]::WriteAllBytes($outputPath, $output)
  if (!$KeepInput) { Remove-Item -LiteralPath $InputPath -Force }
  return [System.IO.Path]::GetFileName($outputPath)
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$postgresBin = if ($env:POSTGRES_BIN) { $env:POSTGRES_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$pgDump = Join-Path $postgresBin 'pg_dump.exe'
$pgRestore = Join-Path $postgresBin 'pg_restore.exe'
$psql = Join-Path $postgresBin 'psql.exe'
if (!(Test-Path -LiteralPath $pgDump) -or !(Test-Path -LiteralPath $pgRestore) -or !(Test-Path -LiteralPath $psql)) { throw 'No se encontraron las herramientas PostgreSQL. Configure POSTGRES_BIN.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ($TenantSlug -and $TenantSlug -notmatch '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$') { throw 'Slug de tenant inválido.' }
$storageProvider = if ($env:OBJECT_STORAGE_PROVIDER) { $env:OBJECT_STORAGE_PROVIDER.ToLowerInvariant() } else { 'local' }
if ($storageProvider -ne 'local') { throw 'Este respaldo incluye archivos locales. Para S3 se requiere un snapshot coordinado del bucket; no se emitira un manifiesto completo sin sus objetos.' }
$controlUrl = if ($env:CONTROL_DATABASE_URL) { $env:CONTROL_DATABASE_URL } else { 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control' }
$where = if ($TenantSlug) { "WHERE slug = '$TenantSlug'" } else { "WHERE status IN ('ACTIVE','SUSPENDED')" }
$arguments = @('-X', '-A', '-t', '-F', "`t", '-c', "SELECT id,slug,database_name FROM control.tenants $where ORDER BY slug")
$lines = Invoke-PostgresCommand -Tool $psql -ConnectionUrl $controlUrl -ToolArguments $arguments
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el registro de tenants.' }
if ($TenantSlug -and !@($lines | Where-Object { $_ }).Count) { throw 'El tenant solicitado no existe. No se genero un respaldo parcial.' }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $projectRoot ".local\backups\$stamp" }
$target = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $target) { throw 'El directorio de backup ya existe. Use un destino nuevo para evitar sobrescribir un respaldo.' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Invoke-PostgresCommand -Tool $pgDump -ConnectionUrl $controlUrl -ToolArguments @('--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--file', (Join-Path $target 'control.dump'))
if ($LASTEXITCODE -ne 0) { throw 'Falló el backup de la base de control.' }
& $pgRestore --list (Join-Path $target 'control.dump') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El dump de control no superó la verificación.' }
$controlFile = Protect-BackupFile -InputPath (Join-Path $target 'control.dump') -Passphrase $EncryptionPassphrase

$manifestTenants = @()
$uploadRoot = [System.IO.Path]::GetFullPath($(if ($env:UPLOAD_ROOT) { $env:UPLOAD_ROOT } else { Join-Path $projectRoot '.local/uploads' }))
$manifestFiles = @()
foreach ($line in $lines) {
  if (!$line) { continue }
  $parts = $line -split "`t"
  $tenantId, $slug, $databaseName = $parts
  if ($tenantId -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' -or $slug -notmatch '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' -or $databaseName -ne ('gc_tenant_' + $tenantId.Replace('-','_'))) { throw 'La identidad registrada del tenant no coincide con su base.' }
  if ($databaseName -notmatch '^gc_tenant_[a-f0-9_]+$') { throw "Nombre de base rechazado: $databaseName" }
  $hostName = if ($env:TENANT_DATABASE_HOST) { $env:TENANT_DATABASE_HOST } else { '127.0.0.1' }
  $port = if ($env:TENANT_DATABASE_PORT) { $env:TENANT_DATABASE_PORT } else { '55432' }
  $userName = if ($env:TENANT_DATABASE_USER) { $env:TENANT_DATABASE_USER } else { 'postgres' }
  $tenantUrl = "postgresql://${userName}@${hostName}:${port}/${databaseName}"
  $dumpName = "tenant-$slug.dump"
  Invoke-PostgresCommand -Tool $pgDump -ConnectionUrl $tenantUrl -Password $env:TENANT_DATABASE_PASSWORD -ToolArguments @('--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--file', (Join-Path $target $dumpName))
  if ($LASTEXITCODE -ne 0) { throw "Falló el backup del tenant $slug." }
  & $pgRestore --list (Join-Path $target $dumpName) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "El dump del tenant $slug no superó la verificación." }
  $encryptedName = Protect-BackupFile -InputPath (Join-Path $target $dumpName) -Passphrase $EncryptionPassphrase
  $manifestTenants += @{ id = $tenantId; slug = $slug; databaseName = $databaseName; file = $encryptedName }
  $tenantFiles = [System.IO.Path]::GetFullPath((Join-Path $uploadRoot $tenantId))
  if ((Split-Path -Parent $tenantFiles) -ne $uploadRoot) { throw 'Destino de objetos fuera del storage del tenant.' }
  if (Test-Path -LiteralPath $tenantFiles -PathType Container) {
    $objects = @(Get-ChildItem -LiteralPath $tenantFiles -Force -Recurse)
    if (((Get-Item -LiteralPath $tenantFiles).Attributes -band [IO.FileAttributes]::ReparsePoint) -or @($objects | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'El storage contiene enlaces; backup rechazado para evitar incluir datos externos.' }
    # The file service stores flat UUID filenames. Reject unexpected nesting.
    if (@($objects | Where-Object { $_.PSIsContainer }).Count) { throw 'El storage del tenant contiene directorios no compatibles.' }
    if (@($objects).Count) {
      $zipPath = Join-Path $target "objects-$slug.zip"
      [System.IO.Compression.ZipFile]::CreateFromDirectory($tenantFiles, $zipPath)
      $manifestFiles += @{ tenantId = $tenantId; file = (Protect-BackupFile -InputPath $zipPath -Passphrase $EncryptionPassphrase); count = @($objects).Count }
    } else {
      $manifestFiles += @{ tenantId = $tenantId; file = $null; count = 0 }
    }
  } else {
    $manifestFiles += @{ tenantId = $tenantId; file = $null; count = 0 }
  }
}

$configurationBackup = $null
if ($IncludeConfiguration) {
  if (!$ConfigurationFile) { $ConfigurationFile = Join-Path $projectRoot '.env' }
  $configurationSource = [System.IO.Path]::GetFullPath($ConfigurationFile)
  if (!(Test-Path -LiteralPath $configurationSource -PathType Leaf)) { throw 'No existe la configuracion solicitada para escrow cifrado.' }
  if ((Get-Item -LiteralPath $configurationSource).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No se permite un enlace como configuracion.' }
  $configurationCopy = Join-Path $target 'recovery-configuration.env'
  Copy-Item -LiteralPath $configurationSource -Destination $configurationCopy
  $configurationBackup = Protect-BackupFile -InputPath $configurationCopy -Passphrase $EncryptionPassphrase
}
$manifest = @{
  version = 3
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  encryption = @{ format = 'GCBAK1'; algorithm = 'AES-256-GCM'; kdf = 'PBKDF2-HMAC-SHA256'; iterations = 200000 }
  control = $controlFile
  tenants = $manifestTenants
  objects = $manifestFiles
  objectStorageProvider = $storageProvider
  configuration = $configurationBackup
  consistency = 'OPERATOR_QUIESCED_SNAPSHOT_REQUIRED'
}
$manifestPath = Join-Path $target 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
# Bind tenant identities, filenames and configuration to the authenticated
# ciphertext. A swapped valid dump must not be accepted as another tenant.
$null = Protect-BackupFile -InputPath $manifestPath -Passphrase $EncryptionPassphrase -KeepInput
Write-Host "Backup verificado creado en $target ($($manifestTenants.Count) tenant(s))."
