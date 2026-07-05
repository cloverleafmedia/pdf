# Code-Signing

Der Windows-Installer wird aktuell **nicht signiert** ausgeliefert. electron-builder unterstützt Signierung ohne weitere Code- oder Konfigurationsänderungen, sobald ein Zertifikat vorhanden ist.

## Aktivieren, sobald ein Zertifikat vorliegt

electron-builder liest die folgenden Umgebungsvariablen automatisch:

- `CSC_LINK` — Pfad oder URL zur `.pfx`/`.p12`-Zertifikatsdatei
- `CSC_KEY_PASSWORD` — Passwort des Zertifikats

```powershell
$env:CSC_LINK = "C:\pfad\zum\zertifikat.pfx"
$env:CSC_KEY_PASSWORD = "..."
npm run dist
```

Ohne gesetzte Variablen läuft `npm run dist` unverändert unsigniert weiter (electron-builders Standardverhalten, `forceCodeSigning` ist nicht gesetzt).

Der Zeitstempel-Server (`build.win.rfc3161TimeStampServer` in `package.json`) ist bereits konfiguriert, damit eine einmal erzeugte Signatur auch nach Ablauf des Zertifikats gültig bleibt — dieser Eintrag wird nur bei tatsächlicher Signierung verwendet und hat sonst keine Wirkung.
