param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [switch]$ConfirmRestore,
  [switch]$VerifyOnly,
  [string]$ConfigurationDestination = "",
  [string]$EncryptionPassphrase = $env:GC_BACKUP_PASSPHRASE
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'postgres-process.ps1')
if (!$ConfirmRestore -and !$VerifyOnly) { throw 'La restauración reemplaza datos. Repita con -ConfirmRestore después de verificar el destino.' }
$source = [System.IO.Path]::GetFullPath($BackupDirectory)
$manifestPath = Join-Path $source 'manifest.json'
if (!(Test-Path -LiteralPath $manifestPath)) { throw 'No existe manifest.json en el backup indicado.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -notin @(2,3) -or $manifest.encryption.format -ne 'GCBAK1') { throw 'Versión o formato de backup no compatible.' }
if ($manifest.version -eq 2 -and !$VerifyOnly) { throw 'El manifiesto legacy no esta autenticado. Verifiquelo y prepare un respaldo version 3 antes de reemplazar datos.' }
if ([string]::IsNullOrWhiteSpace($EncryptionPassphrase) -or $EncryptionPassphrase.Length -lt 16) {
  throw 'Defina GC_BACKUP_PASSPHRASE para descifrar el backup.'
}

function Resolve-ManifestFile {
  param([Parameter(Mandatory=$true)][string]$Name)
  if ($Name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.gcbak$' -or [System.IO.Path]::GetFileName($Name) -ne $Name) {
    throw 'El manifiesto contiene una ruta de archivo no permitida.'
  }
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $source $Name))
  $prefix = $source.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (!$candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archivo fuera del directorio de backup.' }
  if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Falta un archivo indicado en el manifiesto.' }
  if ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No se permiten enlaces de archivo en el backup.' }
  return $candidate
}

# Resolve every file before decrypting or replacing any database, not halfway
# through a restore. A malformed second tenant must not leave a partial restore.
$controlSource = Resolve-ManifestFile -Name ([string]$manifest.control)
foreach ($entry in $manifest.tenants) {
  if ([string]$entry.databaseName -notmatch '^gc_tenant_[a-f0-9_]+$') { throw 'Nombre de base rechazado.' }
  $null = Resolve-ManifestFile -Name ([string]$entry.file)
}
if (-not ('System.Security.Cryptography.AesGcm' -as [type])) { throw 'La restauracion cifrada requiere PowerShell 7. Ejecute pwsh -File scripts/restore.ps1.' }
if ($manifest.version -eq 3) {
  $null = Resolve-ManifestFile -Name 'manifest.json.gcbak'
  foreach ($entry in $manifest.tenants) {
    if ([string]$entry.id -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' -or [string]$entry.databaseName -ne ('gc_tenant_' + ([string]$entry.id).Replace('-','_'))) { throw 'La identidad del tenant no coincide con su base.' }
  }
  if ($manifest.objectStorageProvider -ne 'local') { throw 'El manifiesto de objetos no corresponde a almacenamiento local.' }
  foreach ($entry in $manifest.objects) {
    if ([string]$entry.tenantId -notin @($manifest.tenants | ForEach-Object { [string]$_.id })) { throw 'Objetos referidos a un tenant fuera del respaldo.' }
    if ($entry.file) { $null = Resolve-ManifestFile -Name ([string]$entry.file) }
  }
  if ($manifest.configuration) { $null = Resolve-ManifestFile -Name ([string]$manifest.configuration) }
}
if ($ConfigurationDestination -and (Test-Path -LiteralPath ([System.IO.Path]::GetFullPath($ConfigurationDestination)))) { throw 'La configuracion de recuperacion solo puede escribirse en un destino nuevo. No se sobrescribe .env.' }

function Unprotect-BackupFile {
  param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [Parameter(Mandatory=$true)][string]$Passphrase
  )
  $payload = [System.IO.File]::ReadAllBytes($InputPath)
  if ($payload.Length -lt 50 -or [System.Text.Encoding]::ASCII.GetString($payload, 0, 6) -ne 'GCBAK1') { throw "Archivo cifrado inválido: $InputPath" }
  $salt = $payload[6..21]
  $nonce = $payload[22..33]
  $tag = $payload[34..49]
  $cipher = $payload[50..($payload.Length - 1)]
  $kdf = [System.Security.Cryptography.Rfc2898DeriveBytes]::new($Passphrase, [byte[]]$salt, 200000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  try { $key = $kdf.GetBytes(32) } finally { $kdf.Dispose() }
  $plain = [byte[]]::new($cipher.Length)
  $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
  try { $aes.Decrypt([byte[]]$nonce, [byte[]]$cipher, [byte[]]$tag, $plain) }
  finally { $aes.Dispose(); [Array]::Clear($key, 0, $key.Length) }
  [System.IO.File]::WriteAllBytes($OutputPath, $plain)
  [Array]::Clear($plain, 0, $plain.Length)
}
$postgresBin = if ($env:POSTGRES_BIN) { $env:POSTGRES_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$pgRestore = Join-Path $postgresBin 'pg_restore.exe'
$psql = Join-Path $postgresBin 'psql.exe'
if (!(Test-Path -LiteralPath $pgRestore) -or !(Test-Path -LiteralPath $psql)) { throw 'No se encontraron pg_restore y psql. Configure POSTGRES_BIN.' }
$controlUrl = if ($env:CONTROL_DATABASE_URL) { $env:CONTROL_DATABASE_URL } else { 'postgresql://postgres@127.0.0.1:55432/gestionchurch_control' }
$adminUrl = if ($env:POSTGRES_ADMIN_URL) { $env:POSTGRES_ADMIN_URL } else { 'postgresql://postgres@127.0.0.1:55432/postgres' }
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("gestionchurch-restore-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  if ($manifest.version -eq 3) {
    $authenticatedManifest = Join-Path $temporaryRoot 'manifest-authenticated.json'
    Unprotect-BackupFile -InputPath (Resolve-ManifestFile -Name 'manifest.json.gcbak') -OutputPath $authenticatedManifest -Passphrase $EncryptionPassphrase
    $publicHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($manifestPath)))
    $authenticatedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($authenticatedManifest)))
    if ($publicHash -ne $authenticatedHash) { throw 'El manifiesto no coincide con su copia autenticada. No se restaurara ninguna base.' }
  }
  $controlDump = Join-Path $temporaryRoot 'control.dump'
  Unprotect-BackupFile -InputPath $controlSource -OutputPath $controlDump -Passphrase $EncryptionPassphrase
  & $pgRestore --list $controlDump | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El dump de control descifrado no superó la verificación.' }
  $preparedTenants = @()
  foreach ($tenant in $manifest.tenants) {
    $databaseName = [string]$tenant.databaseName
    $tenantDump = Join-Path $temporaryRoot ("tenant-" + [guid]::NewGuid().ToString('N') + '.dump')
    Unprotect-BackupFile -InputPath (Resolve-ManifestFile -Name ([string]$tenant.file)) -OutputPath $tenantDump -Passphrase $EncryptionPassphrase
    & $pgRestore --list $tenantDump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "El dump descifrado del tenant $($tenant.slug) no superó la verificación." }
    $preparedTenants += @{ tenant = $tenant; dump = $tenantDump }
  }
  $preparedObjects = @()
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $uploadRoot = [IO.Path]::GetFullPath($(if ($env:UPLOAD_ROOT) { $env:UPLOAD_ROOT } else { Join-Path $projectRoot '.local/uploads' }))
  if ((Test-Path -LiteralPath $uploadRoot) -and ((Get-Item -LiteralPath $uploadRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'El storage de destino es un enlace; restauracion rechazada.' }
  foreach ($entry in $manifest.objects) {
    $objectTarget = [IO.Path]::GetFullPath((Join-Path $uploadRoot ([string]$entry.tenantId)))
    if ((Split-Path -Parent $objectTarget) -ne $uploadRoot) { throw 'Destino de objetos fuera del storage.' }
    if ((Test-Path -LiteralPath $objectTarget) -and ((Get-Item -LiteralPath $objectTarget).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'El destino de objetos es un enlace; restauracion rechazada.' }
    $stagingFolder = Join-Path $temporaryRoot ([string]$entry.tenantId)
    if (!$entry.file) {
      if ([int]$entry.count -ne 0) { throw 'Objetos ausentes en un respaldo no vacio.' }
      New-Item -ItemType Directory -Path $stagingFolder | Out-Null
      $preparedObjects += @{ tenantId = [string]$entry.tenantId; folder = $stagingFolder }
      continue
    }
    $archivePath = Join-Path $temporaryRoot ('objects-' + [guid]::NewGuid().ToString('N') + '.zip')
    Unprotect-BackupFile -InputPath (Resolve-ManifestFile -Name ([string]$entry.file)) -OutputPath $archivePath -Passphrase $EncryptionPassphrase
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
      if ($archive.Entries.Count -ne [int]$entry.count) { throw 'El numero de objetos no coincide con el manifiesto.' }
      [long]$expandedBytes = 0
      foreach ($object in $archive.Entries) {
        if ($object.FullName -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\.[a-zA-Z0-9]{1,10}$') { throw 'Ruta de objeto no permitida en el archivo.' }
        $expandedBytes += $object.Length
      }
      if ($expandedBytes -gt 10737418240) { throw 'El archivo supera el limite de expansion de seguridad de 10 GiB.' }
    } finally { $archive.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $stagingFolder)
    $preparedObjects += @{ tenantId = [string]$entry.tenantId; folder = $stagingFolder }
  }
  $configurationDump = $null
  if ($manifest.configuration) {
    $configurationDump = Join-Path $temporaryRoot 'recovery-configuration.env'
    Unprotect-BackupFile -InputPath (Resolve-ManifestFile -Name ([string]$manifest.configuration)) -OutputPath $configurationDump -Passphrase $EncryptionPassphrase
  }
  # All authenticated ciphertext and dump formats must pass before the first
  # --clean write. This is preflight validation, not an atomic cross-DB restore.
  if ($VerifyOnly) {
    Write-Host "Backup cifrado verificado correctamente: $source"
    return
  }
  Invoke-PostgresCommand -Tool $pgRestore -ConnectionUrl $controlUrl -ToolArguments @('--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', ([Uri]$controlUrl).AbsolutePath.TrimStart('/'), $controlDump)
  if ($LASTEXITCODE -ne 0) { throw 'Falló la restauración del plano de control.' }
  foreach ($prepared in $preparedTenants) {
    $tenant = $prepared.tenant
    $databaseName = [string]$tenant.databaseName
    if ($databaseName -notmatch '^gc_tenant_[a-f0-9_]+$') { throw "Nombre de base rechazado: $databaseName" }
    $exists = Invoke-PostgresCommand -Tool $psql -ConnectionUrl $adminUrl -ToolArguments @('-X', '-A', '-t', '-c', "SELECT 1 FROM pg_database WHERE datname='$databaseName'")
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar la base destino.' }
    if (!$exists) { Invoke-PostgresCommand -Tool $psql -ConnectionUrl $adminUrl -ToolArguments @('-X', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $databaseName") }
    if ($LASTEXITCODE -ne 0) { throw "No se pudo preparar $databaseName." }
    $hostName = if ($env:TENANT_DATABASE_HOST) { $env:TENANT_DATABASE_HOST } else { '127.0.0.1' }
    $port = if ($env:TENANT_DATABASE_PORT) { $env:TENANT_DATABASE_PORT } else { '55432' }
    $userName = if ($env:TENANT_DATABASE_USER) { $env:TENANT_DATABASE_USER } else { 'postgres' }
    $tenantUrl = "postgresql://${userName}@${hostName}:${port}/${databaseName}"
    $tenantDump = [string]$prepared.dump
    Invoke-PostgresCommand -Tool $pgRestore -ConnectionUrl $tenantUrl -Password $env:TENANT_DATABASE_PASSWORD -ToolArguments @('--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', $databaseName, $tenantDump)
    if ($LASTEXITCODE -ne 0) { throw "Falló la restauración de $($tenant.slug)." }
    Remove-Item -LiteralPath $tenantDump -Force
  }
  foreach ($prepared in $preparedObjects) {
    $objectTarget = [IO.Path]::GetFullPath((Join-Path $uploadRoot $prepared.tenantId))
    if ((Split-Path -Parent $objectTarget) -ne $uploadRoot) { throw 'Destino de objetos fuera del storage.' }
    if (Test-Path -LiteralPath $objectTarget) {
      if ((Get-Item -LiteralPath $objectTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El destino de objetos es un enlace; restauracion rechazada.' }
      $preservedObjects = Join-Path $uploadRoot ($prepared.tenantId + '.pre-restore-' + [guid]::NewGuid().ToString('N'))
      Move-Item -LiteralPath $objectTarget -Destination $preservedObjects
      Write-Host "Objetos anteriores preservados para recuperacion en $preservedObjects"
    }
    New-Item -ItemType Directory -Path $uploadRoot -Force | Out-Null
    Move-Item -LiteralPath $prepared.folder -Destination $objectTarget
  }
  if ($configurationDump -and $ConfigurationDestination) {
    Copy-Item -LiteralPath $configurationDump -Destination ([IO.Path]::GetFullPath($ConfigurationDestination))
    Write-Host 'Configuracion recuperada en el destino nuevo indicado. Revise endpoints y permisos antes de utilizarla.'
  } elseif ($configurationDump) {
    Write-Host 'Escrow de configuracion verificado. Para recuperarlo indique ConfigurationDestination con una ruta nueva.'
  }
} finally {
  $resolvedTemporary = [System.IO.Path]::GetFullPath($temporaryRoot)
  $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($resolvedTemporary.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTemporary) -match '^gestionchurch-restore-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
  }
}
Write-Host "Restauración completada desde $source. Ejecute pnpm db:migrate y las pruebas de humo."
