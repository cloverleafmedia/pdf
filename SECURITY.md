# Security Policy

## Unterstützte Versionen

Es wird jeweils nur die neueste veröffentlichte Version von CloverleafPDF (siehe [Releases](https://github.com/cloverleafmedia/pdf/releases)) mit Sicherheitsupdates versorgt.

## Sicherheitslücke melden

Bitte meldet Sicherheitslücken **nicht** über ein öffentliches GitHub-Issue.

Nutzt stattdessen den Reiter **"Security" → "Report a vulnerability"** in diesem Repository (GitHub Private Vulnerability Reporting), oder kontaktiert uns direkt.

Bitte gebt nach Möglichkeit an:
- Betroffene Version
- Schritte zur Reproduktion
- Mögliche Auswirkungen (z. B. Codeausführung, Datenverlust, Informationsabfluss)

Wir bemühen uns, innerhalb von 7 Tagen zu reagieren und melden uns mit einer Einschätzung sowie einem geplanten Zeitrahmen für einen Fix zurück.

## Scope

CloverleafPDF ist eine lokale Desktop-Anwendung ohne Server-Backend. Relevante Sicherheitsthemen sind insbesondere:
- Verarbeitung präparierter/bösartiger PDF-Dateien (Parsing, Rendering, OCR)
- Die Electron-IPC-Schnittstelle zwischen Renderer- und Hauptprozess
- Der Auto-Update-Mechanismus
