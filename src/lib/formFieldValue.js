import { PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } from 'pdf-lib'

// Sets a filled-in field's value dispatched by the pdf-lib widget class the
// field actually is, not by the JS type of `value` - needed once fields can
// be Tx/Btn/Ch(dropdown)/Ch(listbox), not just text/checkbox. Mirrors the
// same instanceof-based pattern MailMergeModal.jsx already uses for its CSV
// import, which isn't reused as-is here since its checkbox handling parses
// CSV truthy-strings ('ja'/'yes'/'x'), not the plain boolean the live form UI
// produces.
export function setFormFieldValue(form, name, value) {
  let field
  try { field = form.getField(name) } catch { return }
  if (!field) return
  if (field instanceof PDFCheckBox) { value ? field.check() : field.uncheck(); return }
  if (field instanceof PDFTextField) { field.setText(String(value ?? '')); return }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    // pdf-lib's select() takes a string or an array natively - only stringify
    // for the single-value case, since String(['a','b']) would produce the
    // wrong, comma-joined value instead of a real multi-selection.
    field.select(Array.isArray(value) ? value : String(value))
    return
  }
  if (field instanceof PDFRadioGroup) { field.select(String(value)); return }
}
