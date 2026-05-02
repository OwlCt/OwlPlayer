param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$frontendDir = Join-Path $repoRoot 'frontend'
$goCache = Join-Path $repoRoot '.gocache'
$goModCache = Join-Path $repoRoot '.gomodcache'

function Get-PowerShellExecutable {
    $currentProcessPath = (Get-Process -Id $PID).Path
    if ($currentProcessPath) {
        return $currentProcessPath
    }

    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($pwsh) {
        return $pwsh.Source
    }

    $powershell = Get-Command powershell -ErrorAction SilentlyContinue
    if ($powershell) {
        return $powershell.Source
    }

    throw 'Cannot find a PowerShell executable to launch child processes.'
}

function Assert-CommandExists([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

if (-not (Test-Path $frontendDir)) {
    throw "Frontend directory not found: $frontendDir"
}

Assert-CommandExists 'go'
Assert-CommandExists 'npm'

if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Warning "frontend\\node_modules is missing. Run frontend\\npm install first if the frontend window fails to start."
}

New-Item -ItemType Directory -Force -Path $goCache | Out-Null
New-Item -ItemType Directory -Force -Path $goModCache | Out-Null

$psExe = Get-PowerShellExecutable

$backendCommand = @"
Set-Location '$repoRoot'
`$env:GOCACHE = '$goCache'
`$env:GOMODCACHE = '$goModCache'
`$env:GOTELEMETRY = 'off'
Write-Host '[backend] starting go run .' -ForegroundColor Cyan
go run .
"@

$frontendCommand = @"
Set-Location '$frontendDir'
Write-Host '[frontend] starting npm run dev' -ForegroundColor Cyan
npm run dev
"@

if ($DryRun) {
    Write-Host "PowerShell: $psExe"
    Write-Host ''
    Write-Host 'Backend command:'
    Write-Host $backendCommand
    Write-Host ''
    Write-Host 'Frontend command:'
    Write-Host $frontendCommand
    exit 0
}

Start-Process -FilePath $psExe -WorkingDirectory $repoRoot -ArgumentList @('-NoExit', '-Command', $backendCommand) | Out-Null
Start-Process -FilePath $psExe -WorkingDirectory $frontendDir -ArgumentList @('-NoExit', '-Command', $frontendCommand) | Out-Null

Write-Host 'Started backend and frontend in separate PowerShell windows.'
Write-Host 'Backend:  http://localhost:8080'
Write-Host 'Frontend: http://localhost:3000'
