# Uses only Windows PowerShell / .NET. No Python is needed for environment setup.
function Test-GmPython {
    param([string]$Executable)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $null }
    # Skip Windows Store aliases that may open an installation window.
    if ($Executable -match '\\Microsoft\\WindowsApps\\') { return $null }
    $process = New-Object System.Diagnostics.Process
    try {
        $process.StartInfo.FileName = $Executable
        $process.StartInfo.Arguments = '-I -B -c "import sys,json,ctypes,ssl,hashlib,msvcrt,urllib.request; assert sys.version_info.major == 3 and sys.version_info >= (3,10); assert sys.platform == ''win32''; ctypes.windll.crypt32; print(json.dumps(dict(path=sys.executable,version=list(sys.version_info[:3]))))"'
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        [void]$process.Start()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(8000)) {
            $process.Kill()
            $process.WaitForExit()
            return $null
        }
        $text = $output.GetAwaiter().GetResult()
        [void]$errors.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { return $null }
        $result = $text | ConvertFrom-Json
        if ($result.path -and $result.version.Count -eq 3) { return $result }
    } catch {
        return $null
    } finally {
        $process.Dispose()
    }
    return $null
}

function Get-GmSystemPythonCandidates {
    foreach ($name in @('python.exe', 'python3.exe')) {
        Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }
    }
    foreach ($key in @('HKCU:\Software\Python\PythonCore', 'HKLM:\Software\Python\PythonCore', 'HKLM:\Software\WOW6432Node\Python\PythonCore')) {
        if (-not (Test-Path -LiteralPath $key)) { continue }
        foreach ($version in (Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)) {
            $installKey = Get-Item -LiteralPath (Join-Path $version.PSPath 'InstallPath') -ErrorAction SilentlyContinue
            if ($null -ne $installKey) {
                $executable = $installKey.GetValue('ExecutablePath')
                if ($executable) { $executable }
                elseif ($installKey.GetValue('')) { Join-Path $installKey.GetValue('') 'python.exe' }
            }
        }
    }
}

function Get-GmPython {
    param([Parameter(Mandatory=$true)][string]$PackageRoot)
    $mode = $env:youkia_gm_python_mode
    if ($mode -and $mode -notin @('auto', 'bundled')) { throw 'youkia_gm_python_mode must be auto or bundled.' }
    if ($mode -ne 'bundled') {
        foreach ($candidate in (Get-GmSystemPythonCandidates | Select-Object -Unique)) {
            $found = Test-GmPython -Executable $candidate
            if ($found) { return @{Path=$found.path; Source='system'; Version=$found.version} }
        }
    }
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        throw 'Bundled Python requires Windows x64. On other architectures, install a compatible Python 3.10+ first.'
    }
    $runtimeRoot = Join-Path $PackageRoot 'runtime'
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $lock = $null
    try {
        try {
            $lock = [System.IO.File]::Open((Join-Path $runtimeRoot 'setup.lock'), [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        } catch { throw 'Python setup is busy or runtime directory is not writable. Retry after setup completes.' }
        $installed = Join-Path $runtimeRoot 'python-3.14.8-amd64'
        $python = Join-Path $installed 'python.exe'
        $found = Test-GmPython -Executable $python
        if ($found -and ($found.version -join '.') -eq '3.14.8') {
            return @{Path=$found.path; Source='bundled'; Version=$found.version}
        }
        $archive = Join-Path $PackageRoot 'assets\python-3.14.8-embed-amd64.zip'
        if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Bundled Python archive is missing. Extract the complete skill ZIP again.' }
        $expected = 'a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310'
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Bundled Python SHA256 verification failed. Download the skill ZIP again.' }
        [Console]::Error.WriteLine('youkia GM: preparing bundled Python in the skill folder...')
        $staging = Join-Path $runtimeRoot ('setup-' + [guid]::NewGuid().ToString('N'))
        Expand-Archive -LiteralPath $archive -DestinationPath $staging
        $found = Test-GmPython -Executable (Join-Path $staging 'python.exe')
        if (-not $found -or ($found.version -join '.') -ne '3.14.8') { throw 'Bundled Python failed its environment check. Setup stopped before running GM.' }
        # Keep failed installations recoverable; never overwrite or delete a runtime.
        if (Test-Path -LiteralPath $installed) {
            Move-Item -LiteralPath $installed -Destination (Join-Path $runtimeRoot ('previous-' + [guid]::NewGuid().ToString('N')))
        }
        Move-Item -LiteralPath $staging -Destination $installed
        return @{Path=$python; Source='bundled'; Version=$found.version}
    } finally {
        if ($null -ne $lock) { $lock.Dispose() }
    }
}
