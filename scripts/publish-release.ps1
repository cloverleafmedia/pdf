# "Release veroeffentlichen"-Knopf: baut die App und veroeffentlicht sie als
# GitHub Release ueber electron-builder. Der GitHub-Token wird verschluesselt
# aus %APPDATA%\CloverleafPDF\gh-token.dat gelesen (siehe setup-gh-token.ps1).
#
# Bumpt KEINE Versionsnummer - package.json "version" muss vor dem Klick
# bereits auf die neue Release-Version stehen.

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$tokenFile  = Join-Path $env:APPDATA "CloverleafPDF\gh-token.dat"
$lockFile   = Join-Path $env:TEMP "CloverleafPDF-publish.lock"
$lockMaxAgeMinutes = 20

Set-Location $projectDir

if (-not (Test-Path $tokenFile)) {
    Write-Host "Kein gespeicherter GitHub-Token gefunden." -ForegroundColor Red
    Write-Host "Bitte zuerst einmalig ausfuehren: scripts\setup-gh-token.ps1"
    Read-Host "Enter zum Schliessen"
    exit 1
}

# Verhindert den Bug vom 2026-07-04: zwei gleichzeitige Publish-Laeufe legten
# je ein eigenes GitHub-Release mit demselben Tag an, die Assets wurden auf
# beide verteilt - electron-updater fand das Update dadurch nicht mehr (404).
if (Test-Path $lockFile) {
    $age = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    if ($age.TotalMinutes -lt $lockMaxAgeMinutes) {
        Write-Host "Es laeuft bereits ein anderer Release-Vorgang (Lock von vor $([int]$age.TotalMinutes) Min.)." -ForegroundColor Red
        Write-Host "Bitte warten, bis der andere Vorgang fertig ist - sonst entsteht wieder ein Doppel-Release."
        Read-Host "Enter zum Schliessen"
        exit 1
    } else {
        Write-Host "Alte Lock-Datei (vermutlich abgestuerzter Lauf) wird ignoriert und ueberschrieben." -ForegroundColor DarkYellow
    }
}
Set-Content -Path $lockFile -Value (Get-Date).ToString("o")

try {
    $secureToken = Get-Content $tokenFile | ConvertTo-SecureString
    $bstr        = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken  = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $version = (Get-Content (Join-Path $projectDir "package.json") | ConvertFrom-Json).version
    Write-Host "Veroeffentliche CloverleafPDF v$version ..." -ForegroundColor Cyan

    $env:GH_TOKEN = $plainToken

    # GitHub verlangt fuer sofort veroeffentlichte (nicht-Draft) Releases einen
    # bereits existierenden Git-Tag - ohne das schlaegt electron-builder mit
    # "422 Published releases must have a valid tag" fehl.
    $tagName = "v$version"
    $existingTag = git tag -l $tagName
    if (-not $existingTag) {
        Write-Host "`n--- Tag $tagName anlegen und pushen ---" -ForegroundColor DarkGray
        git tag $tagName
        if ($LASTEXITCODE -ne 0) { throw "git tag fehlgeschlagen (Exit $LASTEXITCODE)" }
        git push origin $tagName
        if ($LASTEXITCODE -ne 0) { throw "git push des Tags fehlgeschlagen (Exit $LASTEXITCODE)" }
    } else {
        Write-Host "`nTag $tagName existiert bereits, ueberspringe." -ForegroundColor DarkGray
    }

    Write-Host "`n--- npm run build ---" -ForegroundColor DarkGray
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`n--- npm run licenses ---" -ForegroundColor DarkGray
    npm run licenses
    if ($LASTEXITCODE -ne 0) { throw "npm run licenses fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`n--- electron-builder --publish always ---" -ForegroundColor DarkGray
    npx electron-builder --win --publish always
    if ($LASTEXITCODE -ne 0) { throw "electron-builder fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`n--- Release-Pruefung (node scripts/verify-release.js) ---" -ForegroundColor DarkGray
    node scripts/verify-release.js
    if ($LASTEXITCODE -ne 0) { throw "Release-Pruefung fehlgeschlagen - electron-updater wird das Update vermutlich nicht finden. Siehe Ausgabe oben." }

    Write-Host "`nFertig. Release v$version ist veroeffentlicht und funktionsfaehig." -ForegroundColor Green
} catch {
    Write-Host "`nFEHLER: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item $lockFile -ErrorAction SilentlyContinue
    Read-Host "`nEnter zum Schliessen"
}
