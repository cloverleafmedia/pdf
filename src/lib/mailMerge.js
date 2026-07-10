import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } from 'pdf-lib'

// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded commas,
// quotes doubled as "", and newlines inside quotes). Good enough for the
// spreadsheet exports (Excel/Numbers/Google Sheets) this feature targets —
// not a full CSV-dialect parser, so no dependency needed for such a small job.
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') pushField()
      else if (c === '\n') pushRow()
      else if (c === '\r') { /* skip, \n handles the row break */ }
      else field += c
    }
  }
  if (field.length || row.length) pushRow()
  const filtered = rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
  if (!filtered.length) return { headers: [], rows: [] }
  const headers = filtered[0]
  const dataRows = filtered.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, rows: dataRows }
}

// Returns whether the field was actually set - `form.getField(name)` throws
// for an unknown field name, and a Dropdown/OptionList/RadioGroup's
// `.select()` throws if the value isn't one of its defined options (e.g. a
// CSV value with a typo, or a stale column that doesn't match the template
// anymore). Both cases are common CSV/template-mismatch mistakes, not
// exceptional situations - callers must check the return value and surface
// it, or a batch can silently produce dozens of PDFs missing a field with no
// indication anything went wrong.
export function setFieldValue(form, name, value) {
  let field
  try { field = form.getField(name) } catch { return false }
  if (!field) return false
  try {
    if (field instanceof PDFTextField) field.setText(String(value ?? ''))
    else if (field instanceof PDFCheckBox) {
      const truthy = ['true', '1', 'x', 'ja', 'yes'].includes(String(value).trim().toLowerCase())
      truthy ? field.check() : field.uncheck()
    }
    // Unlike RadioGroup/OptionList (which throw for an out-of-list value,
    // caught below), PDFDropdown.select() never validates - a value that
    // isn't one of the predefined options silently flips the field to an
    // editable combo box and sets it as free text instead of being
    // rejected. For a non-editable dropdown that's virtually always a CSV
    // typo, not intent, so it's treated as a failure here rather than
    // silently mutating the field's edit flag in the output PDF.
    else if (field instanceof PDFDropdown) {
      if (!field.isEditable() && !field.getOptions().includes(String(value))) return false
      field.select(String(value))
    }
    else if (field instanceof PDFOptionList) field.select(String(value))
    else if (field instanceof PDFRadioGroup) field.select(String(value))
    else return false
    return true
  } catch { return false }
}

export function resolveFilename(tmpl, row, index) {
  const resolved = tmpl.replace(/\{index\}/gi, String(index + 1))
    .replace(/\{([^}]+)\}/g, (_, key) => row[key] ?? '')
  return (resolved.trim() || `Datensatz_${index + 1}`).replace(/[<>:"/\\|?*]/g, '_')
}

// Fills one row of a mail-merge batch into a fresh copy of the template.
// Returns which (header) columns failed to apply - unknown field name or a
// rejected value - so the caller can aggregate and warn across the whole
// batch instead of each row failing in silence (see setFieldValue above).
export async function fillMailMergeRow(templateBytes, headers, row, flatten) {
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const failedHeaders = []
  for (const header of headers) {
    if (!setFieldValue(form, header, row[header])) failedHeaders.push(header)
  }
  if (flatten) form.flatten()
  const bytes = await doc.save()
  return { bytes, failedHeaders }
}
