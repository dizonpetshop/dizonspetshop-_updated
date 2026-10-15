$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$projectMatch = $projectDirectory.ToLowerInvariant()
$projectProcesses = @(Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($projectMatch) -and
    ($_.CommandLine -match '\bdev\b' -or $_.CommandLine -match 'start-server\.js')
})
if ($projectProcesses.Count -gt 0) {
    Stop-Process -Id $projectProcesses.ProcessId -Force
}
Set-Location -LiteralPath $projectDirectory
& node node_modules/prisma/build/index.js generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma client generation failed.' }
$nextExecutable = Join-Path $projectDirectory 'node_modules/next/dist/bin/next'
$process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @($nextExecutable, 'dev', '--port', '3000') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDirectory 'DEV_AUDIT_SERVER.log') -RedirectStandardError (Join-Path $projectDirectory 'DEV_AUDIT_SERVER_ERROR.log') -PassThru
Write-Output "Project development server restarted. PID: $($process.Id)"
