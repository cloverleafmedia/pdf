# Changelog

Alle nennenswerten Änderungen an CloverleafPDF werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

## [Unreleased]

## [1.2.0] – 2026-07-04

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
- Drucken-Dialog erweitert: Seitenauswahl (Alle/Aktuelle Seite/Bereich wie "1-3,5"), Kopienanzahl, live aktualisierte Druckvorschau sowie ein Button "Erweiterte Druckereinstellungen …" für den vollständigen nativen Windows-Druckdialog (druckerspezifische Einstellungen wie Farbe/Duplex/Papierfach)
- Dokument bereinigen: entfernt Metadaten, JavaScript/automatische Aktionen, Anhänge und Ebenen-Konfiguration aus dem PDF, mit Bericht was gefunden/entfernt wurde
- Bates-Nummerierung im Kopf-/Fußzeilen-Dialog (Präfix, Startnummer, Stellenzahl, Platzhalter `{bates}`)
- Serienbrief-Formularausfüllung: füllt ein PDF-Formular für jede Zeile einer CSV-Datei aus und speichert je eine Datei (z. B. für Zertifikate, Rechnungen, Teilnahmebescheinigungen)
- Unterschrift-Dialog: Name/Grund des Unterzeichners werden jetzt auch bei Zeichnen-/Tippen-Signaturen erfasst, als kleine Beschriftung unter der Signatur eingebettet und in einem im Dokument gespeicherten Audit-Trail protokolliert (sichtbar bei erneutem Öffnen des Dialogs, z. B. bei mehreren Unterzeichnern nacheinander)
- Dokumenten-Bibliothek: beobachtete Ordner werden nach PDFs durchsucht, mit Dateiname-/Tag-Suche und optionaler (auf die ersten 40 Treffer × 10 Seiten begrenzter) Volltextsuche
- PDF/A-Export: setzt PDF/A-Kennzeichnung (XMP), bettet ein sRGB-Farbprofil (OutputIntent, offizielles freies ICC-Profil des International Color Consortium) ein, entfernt JavaScript/Anhänge, schreibt eine klassische Xref-Tabelle statt Xref-Stream und setzt eine Trailer-ID
- PDF/A-Export: echte Konformitätsprüfung per mitgeliefertem veraPDF (ISO-19005-Validator der Archivbranche) – Button "Mit veraPDF prüfen" zeigt Regelverstöße mit Klausel/Beschreibung an, statt sich nur auf die eigene Heuristik zu verlassen. veraPDF läuft als eigener Java-Prozess (bereitgestellt via `npm run setup:verapdf`, nicht im Repository) und wird nicht in den eigenen Code eingebunden.
- Barrierefreiheits-Check (PDF/UA): prüft Tagging, Struktur-Baum, Dokumentsprache, Titel-Metadaten und Formularfeld-Beschriftungen; reine Prüfung ohne automatische Behebung

### Geändert
- Versionsnummer unten rechts wird jetzt dynamisch aus package.json gelesen statt fest "v1.0" anzuzeigen
- Symbol für "Befehle durchsuchen" in der Werkzeugleiste von der Mac-⌘-Taste auf ein neutrales Terminal-Symbol geändert (die App nutzt Strg+K, nicht Cmd+K)

### Behoben
- Miniaturansichten in der Seitenleiste folgten nicht automatisch, wenn im Hauptbereich gescrollt wurde (nur der umgekehrte Weg – Klick auf Miniaturansicht → Hauptansicht scrollt – funktionierte). Ursache: Nicht gerenderte Canvas-Miniaturansichten hatten keine reservierte Höhe, wodurch sich die Seitenleiste während der Scroll-Animation noch verschob und das Ziel verfehlt wurde.
- "Drucken"-Button öffnete stattdessen den nativen Windows-Druckdialog (identisch zu "Erweiterte Druckereinstellungen …"), weil der Silent-Modus ohne explizite Angabe fälschlich auf "aus" statt "an" stand
- Druckvorschau wurde abgeschnitten, weil der Dialog dafür zu schmal war (Vorschau-Spalte hatte weniger Platz als das Vorschaubild breit gerendert wurde)
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
