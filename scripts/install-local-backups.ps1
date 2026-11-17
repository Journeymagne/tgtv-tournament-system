param([string]$BackupRoot = 'C:\Backups\KTCompanion')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$root = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
if ($root -notmatch '^C:\\[^\r\n"]+$') { throw 'Use a dedicated folder on drive C' }
$source = Join-Path $PSScriptRoot 'sync-local-backups.ps1'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Synchronization script is missing' }
$null = New-Item -ItemType Directory -Path $root -Force
$cursor = $root
while ($cursor) {
    if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backup paths must not contain links or junctions' }
    $parent = [IO.Path]::GetDirectoryName($cursor)
    if (-not $parent -or $parent -eq $cursor) { break }
    $cursor = $parent
}
$user = [Security.Principal.WindowsIdentity]::GetCurrent()
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($user.User)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($user.User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $root -AclObject $acl
$installed = Join-Path $root 'Sync-Backups.ps1'
Copy-Item -LiteralPath $source -Destination $installed -Force
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $installed + '" -BackupRoot "' + $root + '"'
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments -WorkingDirectory $root
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user.Name
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $user.Name -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'KTCompanion-BackupSync' -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal -Description 'Download and verify the latest two KT Companion release database backups over SSH.' -Force | Out-Null
$readme = @'
KT Companion database backups

Backups\ contains up to two verified PostgreSQL custom-format database dumps.
Each database.dump is paired with metadata.json containing release/version,
capture time, source filename, size and SHA-256. These are full main database
backups, including tournament-system accounts and other services in that database.

Windows task: KTCompanion-BackupSync. Runs every five minutes while signed in,
and at logon. If this computer is offline, it catches up when available.
sync.log and last-sync.json show transfer status. Downloads enter .incoming
first; existing backups are replaced only after size and SHA-256 verification.

Inspect an archive with PostgreSQL 16+ pg_restore --list database.dump.
Restore into a separate empty database first. Code is identified by commitSha
in metadata.json; application environment configuration stays on the server.
'@
[IO.File]::WriteAllText((Join-Path $root 'README.txt'), $readme, (New-Object Text.UTF8Encoding($false)))
Write-Output ('Installed KTCompanion-BackupSync in ' + $root)
