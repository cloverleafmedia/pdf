// Pure, DOM/pdf.js-independent so it's directly unit-testable (same
// convention as formFieldOrder.js): takes plain field-description objects and
// the current fill-in values, returns the display names of every required
// field that's still empty. Used for the non-blocking "Achtung, X Pflichtfelder
// sind noch leer" warning on save - not a hard block, since the app has never
// prevented saving a partially-filled or otherwise "invalid" PDF.

// `widgets`: pdf.js Widget annotations (already-saved AcroForm fields), each
// shaped like { fieldName, fieldType: 'Tx'|'Btn'|'Ch', required, radioButton,
// pushButton, multiSelect, combo }. Radio groups are skipped here for the
// same reason the fill-mode overlay skips their red outline - "no option
// picked yet" isn't well modeled as "this specific widget is wrong".
// `pendingFields`: this app's own not-yet-saved "newfield" drafts, shaped
// like { name, type, required }.
// `formValues`: the store's { [fieldName]: value } map.
export function findEmptyRequiredFieldNames(widgets, pendingFields, formValues) {
  const names = new Set()

  for (const f of widgets || []) {
    if (!f.required || !f.fieldName || (f.fieldType === 'Btn' && f.radioButton)) continue
    if (f.fieldType === 'Btn' && f.pushButton) continue
    const v = formValues[f.fieldName]
    // A signature field's value is a { __signatureDataUrl } object (see
    // formFieldMarkers.js), not text - "filled" just means one was drawn.
    const isFilled = f.fieldType === 'Btn'
      ? !!v
      : (v && typeof v === 'object' && '__signatureDataUrl' in v) ? !!v.__signatureDataUrl
      : Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== null && String(v).trim() !== '')
    if (!isFilled) names.add(f.fieldName)
  }

  for (const f of pendingFields || []) {
    if (!f.required || f.type === 'radio') continue
    const v = formValues[f.name]
    const isFilled = f.type === 'checkbox' ? !!v : (v !== undefined && v !== null && String(v).trim() !== '')
    if (!isFilled) names.add(f.name)
  }

  return Array.from(names)
}
