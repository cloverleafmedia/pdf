# Changelog

Alle nennenswerten Änderungen an CloverleafPDF werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

## [Unreleased]

### Hinzugefügt
- Werkzeugleiste neu gruppiert (Adobe-Vorbild): Kernaktionen bleiben sichtbar, seltener genutzte Werkzeuge in Flyout-Gruppen "Anmerkungen", "Dokument", "Ansicht"
- Umschaltbare Beschriftungen in der Werkzeugleiste ("Aa"-Button)
- Split-Button "Anmerkungen" merkt sich das zuletzt genutzte Werkzeug
- Anheften ("Pin") einzelner Dokument-Werkzeuge direkt in die Hauptleiste
- Befehlspalette (Strg+K) mit durchsuchbarer Liste aller Aktionen
- Übersicht der Tastenkombinationen (Taste `?`)
- Automatische Erkennung von IBAN/E-Mail/Telefonnummer als Schwärzungs-Vorschläge (Werkzeug "Schwärzen" → "IBAN/E-Mail/Telefon erkennen")
- OCR kann den erkannten Text jetzt unsichtbar ins PDF einbetten (Ergebnis-Ansicht → Symbol "durchsuchbar machen") – der Scan bleibt optisch unverändert, ist danach aber durchsuchbar und kopierbar
- Wiederverwendbare Vorlagen für Wasserzeichen und Kopf-/Fußzeile (aktuelle Einstellungen benannt speichern, später mit einem Klick wieder laden)
- Kommentar-Threads: Anmerkungen in der Sidebar können jetzt mehrere Antworten mit Zeitstempel bekommen statt nur einer einzelnen Notiz
- Digitale Signatur mit PKCS#12-Zertifikat (.p12/.pfx) als dritte Option neben Zeichnen/Tippen im Unterschrift-Dialog – erzeugt eine rechtsverbindliche, kryptografisch prüfbare Signatur (CMS/PKCS#7, SHA-256) statt nur eines Bildes; speichert direkt als neue Datei, da jede spätere Änderung die Signatur ungültig machen würde
- Drucken-Dialog: Drucker wird jetzt immer explizit ausgewählt (eigene Liste aller installierten Drucker) statt automatisch den Windows-Standarddrucker zu verwenden

### Geändert
- Versionsnummer unten rechts wird jetzt dynamisch aus package.json gelesen statt fest "v1.0" anzuzeigen

### Behoben
- Drucken tat bei fehlendem Windows-Standarddrucker nichts – zeigt jetzt eine verständliche Fehlermeldung
- Drucken druckte bisher das gesamte App-Fenster statt nur die PDF-Seiten
- Seitenzahl-Anzeige ("1 / 6") brach bei bestimmten Fensterbreiten mitten im Text um
- Dropdown-Menüs der Werkzeugleiste wurden teils unsichtbar abgeschnitten
- **Kritisch:** Ausgefüllte Formularfelder wurden beim Speichern nie ins PDF übernommen
- **Kritisch:** Nach Zusammenführen, Schwärzen, Komprimieren, Zuschneiden, Kopf-/Fußzeile, QR-Code, Unterschrift, Wasserzeichen oder Seiten umsortieren/löschen/duplizieren/einfügen führte ein anschließendes Speichern zu einer leeren bzw. beschädigten Datei ("No PDF header found"), weil `pdfjsLib.getDocument()` den übergebenen Buffer an den Worker überträgt und dabei im Hauptprozess entwertet ("detached") – derselbe Buffer wurde aber weiterhin zum Speichern verwendet. Betraf praktisch jede "PDF ändern dann speichern"-Aktion in der App.
- **Kritisch:** OCR schlug seit der CSP-Härtung (Electron-Upgrade) immer fehl ("Unbekannter Fehler"), weil die Content-Security-Policy das Laden des tesseract.js-Workers/der Sprachdaten von `cdn.jsdelivr.net` blockierte

## [1.1.0] – 2026-07-03

### Geändert
- Electron 31 → 43, PDF.js 4.10 → 6.1, electron-builder 24 → 26
- Content-Security-Policy gehärtet (`unsafe-eval` → `wasm-unsafe-eval`)
- Datei-Zugriffe (Lesen/Schreiben) auf eine Endungs-Allowlist beschränkt

### Hinzugefügt
- Neues Kleeblatt-Logo als App-/Installer-Icon
- `SECURITY.md` (Private Vulnerability Reporting), `PRIVACY.md`, `LICENSE`, `THIRD-PARTY-LICENSES.txt`

## [1.0.0] – 2026-07-01

Erste veröffentlichte Version.

### Hinzugefügt
- PDF-Ansicht mit Zoom, Seitenrotation, Zwei-Seiten-Ansicht, Präsentationsmodus, Nachtmodus, Lupe
- Textauswahl, Volltextsuche, Miniaturansichten, Lesezeichen
- Anmerkungen: Markieren, Unterstreichen, Durchstreichen, Notizen, Textfelder, Freihandzeichnen, Radierer
- Schwärzen (Redaction), Formularfelder anzeigen/ausfüllen
- Zusammenführen, Teilen, Seiten drehen/löschen/duplizieren, Seiten beschneiden
- OCR-Texterkennung, Passwortschutz, Wasserzeichen, digitale Unterschrift (Bild-basiert)
- Kopf-/Fußzeile, PDF komprimieren, Export als Bilder, QR-Code einfügen
- Batch-Verarbeitung, PDFs vergleichen, Anmerkungen exportieren
- Tabbed Browsing, Standard-PDF-App-Integration, Auto-Update, Deutsch/Englisch
