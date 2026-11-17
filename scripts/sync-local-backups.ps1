param(
    [string]$BackupRoot = $PSScriptRoot,
    [string]$SshHost = 'tgtv-server'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$remoteDirectory = '/app/tgtv-ts-shared/work/release-backups'
$ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$root = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
$lock = $null

function Assert-ManagedPath([string]$Value) {
    $full = [IO.Path]::GetFullPath($Value)
    if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path escaped the local backup folder' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backup paths must not contain links or junctions' }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}
function Write-Utf8([string]$File, [string]$Text) {
    [IO.File]::WriteAllText((Assert-ManagedPath $File), $Text, (New-Object Text.UTF8Encoding($false)))
}
function Write-SyncLog([string]$Message) {
    $log = Assert-ManagedPath (Join-Path $root 'sync.log')
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) {
        $old = Assert-ManagedPath ($log + '.1')
        Move-Item -LiteralPath $log -Destination $old -Force
    }
    [IO.File]::AppendAllText($log, ('{0} {1}' -f [DateTime]::UtcNow.ToString('o'), $Message) + [Environment]::NewLine)
}
function Assert-Entry($Entry) {
    if ($null -eq $Entry -or $Entry.id -notmatch '^\d{8}T\d{9}Z-[a-f0-9]{12}$' -or
        $Entry.file -cne ($Entry.id + '.dump') -or $Entry.sha256 -notmatch '^[a-f0-9]{64}$' -or
        $Entry.commitSha -notmatch '^[a-f0-9]{40}$' -or $Entry.releaseId -notmatch '^\d{8}T\d{9}Z-[a-f0-9]{12}$' -or
        [long]$Entry.bytes -le 0 -or $Entry.kind -notin @('release', 'baseline')) { throw 'Invalid server backup manifest' }
    $null = [DateTime]::Parse($Entry.createdAt, [Globalization.CultureInfo]::InvariantCulture)
}
try {
    if ($root -notmatch '^[A-Za-z]:\\.+' -or -not (Test-Path -LiteralPath $root -PathType Container)) { throw 'A dedicated existing local backup directory is required' }
    if ($SshHost -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$') { throw 'Invalid SSH alias' }
    $null = Assert-ManagedPath (Join-Path $root 'sync.lock')
    try { $lock = [IO.File]::Open((Join-Path $root 'sync.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { exit 0 }
    $snapshots = Assert-ManagedPath (Join-Path $root 'Backups')
    $incoming = Assert-ManagedPath (Join-Path $root '.incoming')
    $null = New-Item -ItemType Directory -Path $snapshots, $incoming -Force
    $errors = Assert-ManagedPath (Join-Path $root 'last-transfer-error.txt')
    $connection = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')
    $output = & $ssh @connection $SshHost "cat $remoteDirectory/index.json" 2> $errors
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read server backup index; existing local copies retained' }
    $index = ($output -join "`n") | ConvertFrom-Json
    $entries = @($index.backups)
    if ($index.schema -ne 1 -or $entries.Count -lt 1 -or $entries.Count -gt 2 -or @($entries.id | Select-Object -Unique).Count -ne $entries.Count) { throw 'Invalid server backup index' }
    foreach ($entry in $entries) { Assert-Entry $entry }
    foreach ($entry in $entries) {
        $destination = Assert-ManagedPath (Join-Path $snapshots $entry.id)
        $manifest = Assert-ManagedPath (Join-Path $destination 'metadata.json')
        $dump = Assert-ManagedPath (Join-Path $destination 'database.dump')
        if (Test-Path -LiteralPath $destination) {
            $existing = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
            if ($existing.sha256 -cne $entry.sha256 -or (Get-Item -LiteralPath $dump).Length -ne [long]$entry.bytes) { throw 'An existing local backup does not match its manifest; retained for inspection' }
            continue
        }
        $staging = Assert-ManagedPath (Join-Path $incoming $entry.id)
        $null = New-Item -ItemType Directory -Path $staging -Force
        $partial = Assert-ManagedPath (Join-Path $staging 'database.dump.partial')
        $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($root).Substring(0, 1))
        if ($null -ne $drive.Free -and $drive.Free -lt ([long]$entry.bytes + 1GB)) { throw 'Insufficient local free space; existing backups retained' }
        Write-SyncLog ('Downloading {0} ({1} bytes)' -f $entry.id, $entry.bytes)
        & $scp @connection -q "${SshHost}:$remoteDirectory/$($entry.file)" $partial 2> $errors
        if ($LASTEXITCODE -ne 0) { throw 'Backup transfer failed; existing local copies retained' }
        if ((Get-Item -LiteralPath $partial).Length -ne [long]$entry.bytes -or (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256) { throw 'Downloaded backup size or SHA-256 verification failed' }
        $complete = Assert-ManagedPath (Join-Path $staging 'database.dump')
        Move-Item -LiteralPath $partial -Destination $complete -Force
        Write-Utf8 (Join-Path $staging 'metadata.json') ($entry | ConvertTo-Json -Depth 8)
        # Both resolved absolute paths were checked under the dedicated root.
        $null = Assert-ManagedPath $staging
        $null = Assert-ManagedPath $destination
        Move-Item -LiteralPath $staging -Destination $destination
        Write-SyncLog ('Verified and published ' + $entry.id)
    }
    $locals = @(Get-ChildItem -LiteralPath $snapshots -Directory | Where-Object { $_.Name -match '^\d{8}T\d{9}Z-[a-f0-9]{12}$' } | ForEach-Object {
        $folder = Assert-ManagedPath $_.FullName
        $metadata = Get-Content -LiteralPath (Assert-ManagedPath (Join-Path $folder 'metadata.json')) -Raw | ConvertFrom-Json
        Assert-Entry $metadata
        [PSCustomObject]@{ Folder = $folder; Metadata = $metadata }
    } | Sort-Object { [DateTime]$_.Metadata.createdAt } -Descending)
    foreach ($obsolete in @($locals | Select-Object -Skip 2)) {
        $folder = Assert-ManagedPath $obsolete.Folder
        $children = @(Get-ChildItem -LiteralPath $folder -Force)
        if ($children.Count -ne 2 -or @($children | Where-Object { $_.Name -notin @('database.dump', 'metadata.json') -or $_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }).Count -gt 0) { throw 'Unrecognized files in an obsolete backup; retained for inspection' }
        Remove-Item -LiteralPath $folder -Recurse -Force
        Write-SyncLog ('Removed older managed backup ' + $obsolete.Metadata.id)
    }
    $status = @{ lastSuccessUtc = [DateTime]::UtcNow.ToString('o'); retained = @($locals | Select-Object -First 2 | ForEach-Object { $_.Metadata }); serverUpdatedAt = $index.updatedAt }
    $temporaryStatus = Assert-ManagedPath (Join-Path $root 'last-sync.next.json')
    Write-Utf8 $temporaryStatus ($status | ConvertTo-Json -Depth 10)
    Move-Item -LiteralPath $temporaryStatus -Destination (Assert-ManagedPath (Join-Path $root 'last-sync.json')) -Force
    if ((Test-Path -LiteralPath $errors) -and (Get-Item -LiteralPath $errors).Length -eq 0) { Remove-Item -LiteralPath $errors }
    Write-SyncLog ('Sync completed; {0} verified local backups' -f $status.retained.Count)
    exit 0
} catch {
    try { Write-SyncLog ('ERROR: ' + $_.Exception.Message) } catch {}
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
}
