# Datenschutz- und Netzwerkhinweise

CloverleafPDF ist eine lokale Desktop-Anwendung. Geöffnete PDF-Dateien, Anmerkungen und Einstellungen verbleiben ausschließlich auf dem Gerät des Nutzers. Es findet **kein Tracking, keine Analytics und keine Telemetrie** statt.

Die Anwendung baut in zwei Fällen eine Verbindung zu externen Servern auf:

1. **Update-Prüfung (electron-updater):** Beim Start fragt die App `api.github.com` bzw. die Release-Assets des öffentlichen Repositories `github.com/cloverleafmedia/pdf` ab, um zu prüfen, ob eine neuere Version verfügbar ist. Es werden dabei keine Nutzer- oder Dateidaten übertragen.
2. **OCR-Spracherkennung (tesseract.js):** Bei Nutzung der Texterkennung lädt die App bei Bedarf Sprachtrainingsdaten von einem öffentlichen CDN (jsdelivr, Auslieferung der tesseract.js-Sprachdateien) herunter. Der zu erkennende Dokumentinhalt selbst verlässt dabei nicht das Gerät — nur die (öffentlich verfügbaren) Sprachmodell-Dateien werden heruntergeladen.

Alle übrigen Funktionen (Bearbeiten, Zusammenführen, Wasserzeichen, Signaturen, Export etc.) laufen vollständig offline.
