# Changelog

Alle nennenswerten Änderungen an CloverleafPDF werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

## [Unreleased]

## [1.6.0] – 2026-07-04

### Hinzugefügt
- PDF reparieren: nutzt das bereits gebündelte `qpdf`, um eine beschädigte Datei (defekte Xref-Tabelle, abgebrochene Linearisierung, verkürzte startxref) neu zu schreiben. Schreibt wie Verschlüsseln direkt in eine neue Datei; das geöffnete Dokument bleibt unverändert.
- Tabellen als CSV exportieren: erkennt klar ausgerichtete Tabellen (sichtbare Spaltenabstände, z. B. Rechnungen/Berichte) anhand der Textposition und exportiert jede gefundene Tabelle als eigene CSV-Datei. Verschmolzene Zellen, verschachtelte Tabellen oder Tabellen ohne sichtbare Abstände werden u. U. nicht oder falsch erkannt.
- Formularfeld-Designer: neues Werkzeug erstellt Textfelder und Kontrollkästchen direkt auf der Seite (aufziehen, benennen, mit dem Hand-Werkzeug verschieben/vergrößern) – zusätzlich zum bisherigen reinen Ausfüllen bereits vorhandener Formularfelder.
- PDF-Vergleich: neuer Modus "Visueller Vergleich" zeigt Unterschiede zwischen zwei Dokumenten direkt farblich markiert auf der gerenderten Seite (blockweiser Pixel-Vergleich statt Text-Diff), inklusive Erkennung von nicht vergleichbaren Seitengrößen und fehlenden Seiten im Vergleichsdokument.

## [1.5.0] – 2026-07-04

### Sicherheit
- **Kritisch:** "Schwärzen" hat den geschwärzten Bereich bisher nur mit einem schwarzen Rechteck *überdeckt* — der ursprüngliche Text/Bildinhalt blieb darunter vollständig erhalten und war weiterhin per Textauswahl, Suche oder jedem Werkzeug auslesbar, das die oberste Grafikebene ignoriert (derselbe Fehler, der in der Vergangenheit bei "geschwärzten" Dokumenten realer Institutionen zum eigentlich verdeckten Text führte). Geschwärzte Seiten werden jetzt bei "Schwärzung anwenden" in ein Bild gerastert (die Schwärzungs-Balken werden direkt in die Pixel gebrannt), bevor sie zurück ins PDF eingebettet werden; Seiten ohne Schwärzung bleiben unverändert durchsuchbar. Im Anschluss wird automatisch geprüft, dass auf den geschwärzten Seiten wirklich kein Text mehr extrahierbar ist. Bewusste Konsequenz: Formularfelder und Verknüpfungen auf einer geschwärzten Seite gehen mit weg (Hinweis dazu jetzt auch in der Werkzeugleiste).
- Neu: "Signatur prüfen" verifiziert eine im PDF eingebettete digitale Signatur (PKCS#7/CMS) kryptografisch — inkl. Erkennung, ob die Datei nach der Signatur verändert wurde, und Angaben zum Zertifikat des Unterzeichners (Gültigkeitszeitraum, Aussteller). node-forge kann PKCS#7 nur signieren, nicht prüfen (`verify()` ist dort ein nicht implementierter Platzhalter) — die Signatur-Struktur (SignerInfo) wird deshalb selbst per ASN.1 dekodiert.
- Electron-Härtung: `sandbox: true` für das Hauptfenster explizit gesetzt; In-App-Navigation zu externen URLs sowie neue Popup-Fenster werden abgefangen und stattdessen im Standardbrowser geöffnet, statt die App selbst zu navigieren (bisher gab es dafür keine Sperre, auch wenn aktuell keine anklickbaren PDF-Links gerendert werden).
- `npm run audit:deps` (neu): manueller Vorab-Release-Schritt wie `verify:release`, prüft Produktions-Abhängigkeiten per `npm audit` auf kritische Schwachstellen.

### Hinweise
- `npm run audit:deps` findet aktuell eine kritische, aber nicht ausnutzbare Kette: `crypto-js < 4.2.0` (schwaches PBKDF2, kein Fix verfügbar) über `pdfkit` → `@signpdf/placeholder-pdfkit010` → `@signpdf/placeholder-plain`. `pdfkit` ist dort nur eine `peerDependency` und wird im tatsächlich von uns genutzten Codepfad (`plainAddPlaceholder`) an keiner Stelle mit `require()` geladen — geprüft, `crypto-js` wird also nie ausgeführt. Beobachten, bis @signpdf/pdfkit das upstream lösen.

## [1.4.0] – 2026-07-04

### Hinzugefügt
- Cloud-Sync-Ordner erkennen: Button in der Dokumenten-Bibliothek findet lokale OneDrive-/Google-Drive-/Dropbox-Ordner (inkl. "OneDrive - Firma"-Varianten und Dropbox-Custom-Pfaden) und fügt sie per Checkliste zur Bibliothek hinzu.
- Design-Option "System": App folgt live dem Windows-Hell/Dunkel-Modus, sofern nicht ausdrücklich Dunkel/Hell gewählt wurde.
- Tastatur-Tab-Navigation zwischen Formularfeldern: Tab/Umschalt+Tab springt jetzt in Lesereihenfolge (oben-nach-unten, links-nach-rechts) statt in roher PDF-Reihenfolge, auch über Seitengrenzen hinweg.
- Anmerkungen als XFDF exportieren/importieren (Acrobat-kompatibles Austauschformat) zusätzlich zum bestehenden Klartext-Export — inklusive Antwort-Threads beim Export.
- PDF-Vergleich: neuer Modus "Text-Vergleich" zeigt einen echten wortbasierten Unterschieds-Text mit Seiten-Zuordnung, zusätzlich zu Nebeneinander/Übereinander.

### Behoben
- `scripts/publish-release.ps1` legt jetzt vor dem `electron-builder --publish`-Schritt selbst einen leeren GitHub-Release für den Ziel-Tag an, falls noch keiner existiert. Grund: electron-builder lädt Installer und Blockmap parallel hoch, und ohne bereits existierenden Release versucht jeder Upload unabhängig, ihn anzulegen — beim v1.3.1-Release gewann nur einer dieses Rennen, der andere schlug mit „422 already_exists" fehl und riss den gesamten Publish-Vorgang ab, bevor `latest.yml` hochgeladen wurde.

## [1.3.1] – 2026-07-04

### Hinzugefügt
- `scripts/verify-release.js` (`npm run verify:release`): prüft nach einem Publish live, ob für den aktuellen Versions-Tag genau ein GitHub-Release existiert, alle Update-Dateien hochgeladen sind und die von electron-updater genutzten Download-URLs wirklich erreichbar sind.
- Test-Tooling: Vitest (Node-Umgebung, kein jsdom) mit 64 Tests für bisher ungetestete Logik — Store-Reducer (Undo/Redo, Zoom, Rotation, Tab-Verwaltung), PDF/A-/Barrierefreiheits-Prüfungen, Annotation-Flattening, PII-/Volltext-Schwärzungserkennung, Sidebar-Seitenoperationen. `npm run test` / `npm run test:watch`.

### Geändert
- Code-Cleanup vor v1.4.0: reine Logik aus `PDFViewer.jsx` und `Sidebar.jsx` nach `src/lib/` extrahiert (`annotationFlatten.js`, `piiDetection.js`, `chunk.js`, `pdfPageOps.js`, `navigate.js`), doppelte Button-Klassen-Logik und Sticky-Note/Textfeld-Drag-Handler in Toolbar/PDFViewer zusammengefasst.
- Alle ~25 Modal-Komponenten werden jetzt per `React.lazy()` nachgeladen statt statisch gebündelt — Hauptchunk sinkt von 507KB auf 339KB, die "Chunk größer als 500kB"-Build-Warnung ist behoben.

### Behoben
- `scripts/publish-release.ps1` legte bei zwei gleichzeitigen/schnell hintereinander gestarteten Läufen zwei GitHub-Releases mit demselben Tag an, wodurch Update-Dateien auf beide verteilt wurden und electron-updater sie nicht mehr fand (404). Skript hat jetzt eine Lock-Datei gegen Doppel-Läufe und ruft am Ende automatisch `verify-release.js` auf.
- Gespeicherte Highlight-Deckkraft war fest auf 0,35 codiert statt den einstellbaren Opacity-Regler zu nutzen — was auf dem Bildschirm zu sehen war und was gespeichert wurde, konnte dadurch auseinanderlaufen.
- Schwärzungs-Rechtecke nutzten beim Ziehen (0,4) und im bestätigten/wartenden Zustand (0,55) unterschiedliche Deckkraft — jetzt vereinheitlicht.
- Eine Annotation, die auf eine inzwischen gelöschte Seite zeigte, ließ das Speichern abstürzen (`doc.getPage()` wirft bei ungültigem Index eine Exception statt `null`) statt sie stillschweigend zu ignorieren.

## [1.3.0] – 2026-07-04

### Hinzugefügt
- PDF verschlüsseln: 256-Bit-AES-Verschlüsselung mit Öffnen-/Eigentümer-Passwort und Berechtigungen (Drucken/Kopieren/Bearbeiten sperren), per gebündeltem `qpdf` (pdf-lib selbst unterstützt keine Verschlüsselung). Schreibt wie die digitale Signatur direkt in eine neue Datei; das geöffnete Dokument bleibt unverschlüsselt bearbeitbar.
- Bilder zu PDF: mehrere JPG/PNG-Bilder zu einem neuen PDF zusammenfügen, eine Seite pro Bild, mit Umsortieren/Entfernen vor dem Erstellen.
- Suchen & Schwärzen: die bestehende IBAN/E-Mail/Telefon-Auto-Erkennung um einen freien Suchbegriff (optional Regex, Groß-/Kleinschreibung) erweitert, der alle Fundstellen im Dokument zur Schwärzung markiert.
- Alt-Texte für Bilder: neuer Editor im Barrierefreiheits-Check, der fehlenden Alternativtext an Bildern nachträgt (minimale Figure/Alt-Tag-Struktur je Bildvorkommen, wiederkehrende Bilder wie Logos nur einmal abgefragt).

### Hinweise
- Für `npm run dist` ist zusätzlich `npm run setup:qpdf` einmalig nötig (analog zu `setup:verapdf`), lädt ein portables qpdf (Apache-2.0) nach `vendor/qpdf-runtime/`.

## [1.2.2] – 2026-07-04

### Geändert
- Barrierefreiheits-Check (PDF/UA) erkennt jetzt zusätzlich fehlenden Alt-Text an Bildern

## [1.2.1] – 2026-07-04

### Behoben
- `npm run setup:verapdf` bündelte veraPDF ohne dessen eigene `LICENSE.GPL`/`LICENSE.MPL`-Dateien (der Installer entpackt sie nicht automatisch) – werden jetzt zusätzlich von der offiziellen Quelle geladen
- Lizenz-Generator (`npm run licenses`) schloss den eigenen Paketeintrag nur bei Version 1.0.0 aus (fest verdrahtet) – seit 1.1.0 tauchte CloverleafPDF selbst fälschlich in seiner eigenen Drittanbieter-Lizenzliste auf

## [1.2.0] – 2026-07-04

### Hinzugefügt
- Werkzeugleiste neu gruppiert: Kernaktionen bleiben sichtbar, seltener genutzte Werkzeuge in Flyout-Gruppen "Anmerkungen", "Dokument", "Ansicht"
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
