# "Release veroeffentlichen"-Knopf: baut die App und veroeffentlicht sie als
# GitHub Release ueber electron-builder. Der GitHub-Token wird verschluesselt
# aus %APPDATA%\CloverleafPDF\gh-token.dat gelesen (siehe setup-gh-token.ps1).
#
# Bumpt KEINE Versionsnummer - package.json "version" muss vor dem Klick
# bereits auf die neue Release-Version stehen.

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$tokenFile  = Join-Path $env:APPDATA "CloverleafPDF\gh-token.dat"

Set-Location $projectDir

if (-not (Test-Path $tokenFile)) {
    Write-Host "Kein gespeicherter GitHub-Token gefunden." -ForegroundColor Red
    Write-Host "Bitte zuerst einmalig ausfuehren: scripts\setup-gh-token.ps1"
    Read-Host "Enter zum Schliessen"
    exit 1
}

try {
    $secureToken = Get-Content $tokenFile | ConvertTo-SecureString
    $bstr        = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken  = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $version = (Get-Content (Join-Path $projectDir "package.json") | ConvertFrom-Json).version
    Write-Host "Veroeffentliche CloverleafPDF v$version ..." -ForegroundColor Cyan

    $env:GH_TOKEN = $plainToken

    Write-Host "`n--- npm run build ---" -ForegroundColor DarkGray
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`n--- npm run licenses ---" -ForegroundColor DarkGray
    npm run licenses
    if ($LASTEXITCODE -ne 0) { throw "npm run licenses fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`n--- electron-builder --publish always ---" -ForegroundColor DarkGray
    npx electron-builder --win --publish always
    if ($LASTEXITCODE -ne 0) { throw "electron-builder fehlgeschlagen (Exit $LASTEXITCODE)" }

    Write-Host "`nFertig. Auf GitHub pruefen: Release ist kein Draft, Tag passt (v$version), Prerelease = None." -ForegroundColor Green
} catch {
    Write-Host "`nFEHLER: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
    Read-Host "`nEnter zum Schliessen"
}
