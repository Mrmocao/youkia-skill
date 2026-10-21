$ErrorActionPreference = 'Stop'
try {
    . (Join-Path $PSScriptRoot 'scripts\bootstrap.ps1')
    $runtime = Get-JiraPython -PackageRoot $PSScriptRoot
    $cliArguments = @($args)
    if ($cliArguments.Count -eq 0) { $cliArguments = @('startup') }
    & $runtime -I -B (Join-Path $PSScriptRoot 'scripts\jira.py') @cliArguments
    exit $LASTEXITCODE
} catch {
    @{ok=$false;error=@{code='BOOTSTRAP_ERROR';message='运行环境未就绪，请检查完整解压目录与写入权限。'}} | ConvertTo-Json -Compress
    exit 2
}
