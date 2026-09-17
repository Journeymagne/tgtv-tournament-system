$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$shortRoot = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($projectRoot).ShortPath
$pidFile = Join-Path $projectRoot 'work\local-runtime\app.pid'
$entrypoint = Join-Path $shortRoot 'server.js'

if (Test-Path -LiteralPath $pidFile) {
    $appId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $appId" -ErrorAction SilentlyContinue
    if ($candidate) {
        if ($candidate.Name -ne 'node.exe' -or !$candidate.CommandLine.Contains($entrypoint)) {
            throw 'The saved PID belongs to another process. Refusing to stop it.'
        }
        Stop-Process -Id $appId
        Wait-Process -Id $appId -Timeout 10 -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $pidFile
}

$pgCtl = Join-Path $shortRoot 'work\local-runtime\pgsql\bin\pg_ctl.exe'
$pgData = Join-Path $shortRoot 'data\local-postgres'
if ((Test-Path -LiteralPath $pgCtl) -and (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
    & $pgCtl -D $pgData status *> $null
    if ($LASTEXITCODE -eq 0) {
        & $pgCtl -D $pgData -m fast -w -t 30 stop
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not stop. Check its log.' }
    }
}
Write-Output 'Local application and PostgreSQL stopped. Database files are preserved.'
