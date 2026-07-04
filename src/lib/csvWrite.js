// Hand-rolled RFC4180-ish CSV writer - mirrors the hand-rolled CSV *parser*
// already used by MailMergeModal.jsx and the hand-rolled XML escaping in
// xfdfEscape.js: this is a small enough job that a dependency isn't worth it.

export function csvEscapeField(value) {
  const s = value === null || value === undefined ? '' : String(value)
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
