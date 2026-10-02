# Connection credentials must not appear in a pg_dump/pg_restore/psql process
# command line. Values are scoped to the child environment and then restored.
function Invoke-PostgresCommand {
  param(
    [Parameter(Mandatory=$true)][string]$Tool,
    [Parameter(Mandatory=$true)][string]$ConnectionUrl,
    [Parameter(Mandatory=$true)][string[]]$ToolArguments,
    [string]$Password = ''
  )
  try { $connection = [Uri]$ConnectionUrl } catch { throw 'URL PostgreSQL no valida.' }
  if ($connection.Scheme -notin @('postgres', 'postgresql') -or !$connection.Host -or !$connection.AbsolutePath.Trim('/')) { throw 'URL PostgreSQL incompleta.' }
  $credentials = $connection.UserInfo -split ':', 2
  $values = @{
    PGHOST = $connection.Host
    PGPORT = $(if ($connection.Port -gt 0) { [string]$connection.Port } else { '5432' })
    PGDATABASE = [Uri]::UnescapeDataString($connection.AbsolutePath.TrimStart('/'))
    PGCONNECT_TIMEOUT = '10'
  }
  if ($credentials[0]) { $values.PGUSER = [Uri]::UnescapeDataString($credentials[0]) }
  if ($credentials.Count -eq 2) { $values.PGPASSWORD = [Uri]::UnescapeDataString($credentials[1]) }
  elseif ($Password) { $values.PGPASSWORD = $Password }
  $queryVariables = @{ sslmode='PGSSLMODE'; sslrootcert='PGSSLROOTCERT'; sslcert='PGSSLCERT'; sslkey='PGSSLKEY'; application_name='PGAPPNAME'; connect_timeout='PGCONNECT_TIMEOUT'; options='PGOPTIONS' }
  foreach ($parameter in $connection.Query.TrimStart('?') -split '&') {
    if (!$parameter) { continue }
    $pair = $parameter -split '=', 2
    if ($pair.Count -ne 2 -or !$queryVariables.ContainsKey($pair[0])) { throw 'Parametro de conexion PostgreSQL no soportado; configure el entorno libpq.' }
    $values[$queryVariables[$pair[0]]] = [Uri]::UnescapeDataString($pair[1])
  }
  $previous = @{}
  try {
    foreach ($name in $values.Keys) {
      $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
      [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    & $Tool @ToolArguments
    $commandExit = $LASTEXITCODE
  } finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
  }
  $global:LASTEXITCODE = $commandExit
}
