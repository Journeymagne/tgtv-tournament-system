$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# PostgreSQL's Windows tools need the ASCII short path when a parent has Cyrillic characters.
$shortRoot = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($projectRoot).ShortPath
$runtimePath = Join-Path $projectRoot 'work\local-runtime'
$pgCtl = Join-Path $shortRoot 'work\local-runtime\pgsql\bin\pg_ctl.exe'
$pgData = Join-Path $shortRoot 'data\local-postgres'
$pidFile = Join-Path $runtimePath 'app.pid'
$entrypoint = Join-Path $shortRoot 'server.js'

if (!(Test-Path -LiteralPath $pgCtl) -or !(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
    throw 'Local PostgreSQL is not initialized. See docs/local-development.md.'
}
if (!(Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Local .env is missing.' }

Push-Location $projectRoot
try {
    & node -e 'const c=require("./src/config"); const u=new URL(c.DATABASE_URL); if(u.hostname!=="127.0.0.1"||u.port!=="55432"||u.pathname!=="/tgtv_local_demo"||c.HOST!=="127.0.0.1"||c.PORT!==3000) throw Error("Expected local demo configuration: 127.0.0.1:3000 and tgtv_local_demo on 55432");'
    if ($LASTEXITCODE -ne 0) { throw 'Unexpected configuration; local service was not started.' }

    & $pgCtl -D $pgData status *> $null
    if ($LASTEXITCODE -ne 0) {
        & $pgCtl -D $pgData -l (Join-Path $shortRoot 'work\local-runtime\postgres.log') -o '-h 127.0.0.1 -p 55432' -w -t 30 start
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start. Check work/local-runtime/postgres.log.' }
    }

    $appProcess = $null
    if (Test-Path -LiteralPath $pidFile) {
        $appId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
        $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $appId" -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.Name -eq 'node.exe' -and $candidate.CommandLine.Contains($entrypoint)) {
            $appProcess = Get-Process -Id $appId
        } elseif ($candidate) {
            throw 'The saved PID belongs to another process. Refusing to reuse it.'
        }
    }
    if (!$appProcess) {
        $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw 'Port 3000 is already occupied by another process.' }
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $appProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $entrypoint + '"') `
            -WorkingDirectory $shortRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtimePath 'app.log') `
            -RedirectStandardError (Join-Path $runtimePath 'app.err')
        Set-Content -LiteralPath $pidFile -Value $appProcess.Id -Encoding ascii
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw 'Application exited. Check work/local-runtime/app.err.' }
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/me' -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw 'Application did not become ready. Check work/local-runtime/app.err.' }
    Write-Output "TGTV is running: http://127.0.0.1:3000 (PID $($appProcess.Id))"
    Write-Output 'PostgreSQL: 127.0.0.1:55432 / tgtv_local_demo'
} finally {
    Pop-Location
}
