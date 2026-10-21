[CmdletBinding()]
param([string]$SkillsRoot)
$ErrorActionPreference = 'Stop'
if (-not $SkillsRoot) {
    if ($env:CODEX_HOME) { $SkillsRoot = Join-Path $env:CODEX_HOME 'skills' }
    else { $SkillsRoot = Join-Path $env:USERPROFILE '.codex\skills' }
}
$destination = [System.IO.Path]::GetFullPath((Join-Path $SkillsRoot 'youkia-gm'))
if (Test-Path -LiteralPath $destination) {
    throw "Destination already exists. Preserve or move the existing skill before installing: $destination"
}
New-Item -ItemType Directory -Path $SkillsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $destination | Out-Null
foreach ($entry in @('SKILL.md','README.md','install.ps1','gm.ps1','agents','scripts','references','assets')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry) -Destination $destination -Recurse
}
Write-Output "Installed skill: $destination"
Write-Output 'Open a new Codex conversation and invoke $youkia-gm. Configure your own GM account on first use.'
