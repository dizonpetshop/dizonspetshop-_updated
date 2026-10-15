$ErrorActionPreference = 'Stop'
$attendanceProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$attendanceNode = (Get-Command node.exe).Source
$attendanceScript = Join-Path $attendanceProjectRoot 'scripts/run-attendance-job.mjs'
$attendanceEnv = Join-Path $attendanceProjectRoot '.env.local'
$attendanceTaskName = 'DizonPetshopGroomingNoShows'
$attendanceExisting = Get-ScheduledTask -TaskName $attendanceTaskName -ErrorAction SilentlyContinue
$attendanceExpectedScript = $attendanceScript.Replace('\', '/')
$attendanceOwnedAction = if ($attendanceExisting) { $attendanceExisting.Actions | Where-Object { $_.Arguments.Replace('\', '/') -like ('*' + $attendanceExpectedScript + '*') -and $_.WorkingDirectory -eq $attendanceProjectRoot } } else { $null }
if ($attendanceExisting -and -not $attendanceOwnedAction) { throw 'An unrelated task already uses this name.' }
$attendanceAction = New-ScheduledTaskAction -Execute $attendanceNode -Argument ('--env-file="' + $attendanceEnv + '" "' + $attendanceScript + '"') -WorkingDirectory $attendanceProjectRoot
$attendanceTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$attendanceSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$attendancePrincipal = New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + '\' + $env:USERNAME) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $attendanceTaskName -Action $attendanceAction -Trigger $attendanceTrigger -Settings $attendanceSettings -Principal $attendancePrincipal -Description 'Processes grooming no-shows and expired product pickups, with client notifications, every minute while this Windows account is signed in.' -Force | Select-Object TaskName, State
