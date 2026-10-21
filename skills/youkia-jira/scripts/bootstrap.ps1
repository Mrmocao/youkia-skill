function Test-JiraPython {
    param([string]$Executable)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf) -or $Executable -match '\\Microsoft\\WindowsApps\\') { return $false }
    $process = New-Object System.Diagnostics.Process
    try {
        $process.StartInfo.FileName = $Executable
        $process.StartInfo.Arguments = '-I -B -c "import sys,ctypes,ssl,urllib.request; assert sys.platform == ''win32'' and sys.version_info >= (3,12); ctypes.windll.crypt32"'
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        [void]$process.Start()
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(8000)) { $process.Kill(); $process.WaitForExit(); return $false }
        [void]$outputTask.GetAwaiter().GetResult()
        [void]$errorTask.GetAwaiter().GetResult()
        return $process.ExitCode -eq 0
    } catch { return $false } finally { $process.Dispose() }
}

function Get-JiraPython {
    param([string]$PackageRoot)
    if ($env:youkia_jira_python_mode -ne 'bundled') {
        $candidates = @(Get-Command python.exe,python3.exe -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
        foreach ($registryRoot in @('HKCU:\Software\Python\PythonCore','HKLM:\Software\Python\PythonCore')) {
            if (-not (Test-Path -LiteralPath $registryRoot)) { continue }
            foreach ($version in Get-ChildItem -LiteralPath $registryRoot -ErrorAction SilentlyContinue) {
                $installKey = Get-Item -LiteralPath (Join-Path $version.PSPath 'InstallPath') -ErrorAction SilentlyContinue
                if ($null -ne $installKey -and $installKey.GetValue('')) { $candidates += Join-Path $installKey.GetValue('') 'python.exe' }
            }
        }
        foreach ($candidate in $candidates | Select-Object -Unique) { if (Test-JiraPython $candidate) { return $candidate } }
    }
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Windows x64 required for bundled runtime.' }
    $runtimeRoot = Join-Path $PackageRoot 'runtime'
    [void](New-Item -ItemType Directory -Path $runtimeRoot -Force)
    $runtimeLock = [IO.File]::Open((Join-Path $runtimeRoot 'setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        $runtimeDirectory = Join-Path $runtimeRoot 'python-3.14.8-amd64'
        $runtimeExecutable = Join-Path $runtimeDirectory 'python.exe'
        if (Test-JiraPython $runtimeExecutable) { return $runtimeExecutable }
        $archive = Join-Path $PackageRoot 'assets\python-3.14.8-embed-amd64.zip'
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310') { throw 'Runtime integrity failure.' }
        $staging = Join-Path $runtimeRoot ('setup-' + [Guid]::NewGuid().ToString('N'))
        Expand-Archive -LiteralPath $archive -DestinationPath $staging
        if (-not (Test-JiraPython (Join-Path $staging 'python.exe'))) { throw 'Bundled runtime unavailable.' }
        if (Test-Path -LiteralPath $runtimeDirectory) { Move-Item -LiteralPath $runtimeDirectory -Destination (Join-Path $runtimeRoot ('previous-' + [Guid]::NewGuid().ToString('N'))) }
        Move-Item -LiteralPath $staging -Destination $runtimeDirectory
        return $runtimeExecutable
    } finally { $runtimeLock.Dispose() }
}
