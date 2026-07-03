# Einmalig ausführen: speichert den GitHub-Token verschlüsselt (Windows DPAPI,
# nur von diesem Windows-Konto auf diesem Rechner entschlüsselbar).
# Der Tokenwert selbst wird nirgends im Klartext abgelegt.

$ErrorActionPreference = "Stop"

$configDir  = Join-Path $env:APPDATA "CloverleafPDF"
$tokenFile  = Join-Path $configDir "gh-token.dat"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

Write-Host "GitHub Personal Access Token eingeben (Eingabe bleibt unsichtbar):"
$secureToken = Read-Host -AsSecureString

$secureToken | ConvertFrom-SecureString | Set-Content -Path $tokenFile -Encoding UTF8

Write-Host ""
Write-Host "Gespeichert unter: $tokenFile"
Write-Host "Der Token ist jetzt fuer 'Release veroeffentlichen.lnk' auf dem Desktop hinterlegt."
Read-Host "Enter zum Schliessen"
