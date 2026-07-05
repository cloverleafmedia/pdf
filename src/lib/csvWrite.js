// Hand-rolled RFC4180-ish CSV writer - mirrors the hand-rolled CSV *parser*
// already used by MailMergeModal.jsx and the hand-rolled XML escaping in
// xfdfEscape.js: this is a small enough job that a dependency isn't worth it.

// Fields starting with =, +, -, or @ are treated as formulas by Excel/Sheets
// when the CSV is opened there - a PDF whose extracted table cell text starts
// with one of these could otherwise inject a live formula into the exported
// file. Prefixing with a single quote (OWASP's standard CSV-injection
// mitigation) neutralizes it while keeping the visible text unchanged.
export function csvEscapeField(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  const s = /^[=+\-@]/.test(raw) ? "'" + raw : raw
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function csvRow(fields) {
  return fields.map(csvEscapeField).join(',')
}

// headerRow may be null/[] to skip writing a separate header line (e.g. a
// detected table has no reliably-distinguishable header row).
export function writeCSV(headerRow, dataRows) {
  const rows = headerRow && headerRow.length ? [headerRow, ...dataRows] : dataRows
  return rows.map(csvRow).join('\r\n')
}
