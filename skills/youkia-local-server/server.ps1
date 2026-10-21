$ErrorActionPreference = 'Stop'
try {
    . (Join-Path $PSScriptRoot 'scripts\bootstrap.ps1')
    $runtime = Get-LocalServerPython -PackageRoot $PSScriptRoot
    $env:youkia_server_runtime_source = $runtime.Source
    $cliArgs = @($args)
    if ($cliArgs.Count -eq 0) { $cliArgs = @('startup') }
    & $runtime.Path -I -B (Join-Path $PSScriptRoot 'scripts\server.py') @cliArgs
    exit $LASTEXITCODE
} catch {
    @{ok=$false; error=@{code='BOOTSTRAP_ERROR'; message=$_.Exception.Message}} | ConvertTo-Json -Compress
    exit 2
}
