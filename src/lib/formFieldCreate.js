// pdf-lib's form.createTextField(name)/createCheckBox(name) throw if a field
// with that name already exists - both against pre-existing AcroForm fields
// and against sibling drafts placed in the same session, so every new field
// needs a name that's actually unique before it reaches pdf-lib.

const TYPE_LABELS = { text: 'Textfeld', checkbox: 'Kontrollkästchen', dropdown: 'Dropdown-Liste', listbox: 'Listenfeld', radio: 'Radio-Button-Gruppe', date: 'Datumsfeld', signature: 'Unterschriftsfeld' }

export function defaultFieldName(type, index) {
  return `${TYPE_LABELS[type] || 'Feld'} ${index}`
}

export function dedupeFieldName(name, existingNames) {
  if (!existingNames.includes(name)) return name
  let n = 2
  while (existingNames.includes(`${name} (${n})`)) n++
  return `${name} (${n})`
}

// Radio-group option values only need to be unique within their own group
// (pdf-lib's addOptionToPage(value, ...) is what breaks on a collision), not
// globally like field names - so this takes just that group's existing
// values, not the whole document's field list.
export function nextRadioOptionValue(existingValues) {
  let n = existingValues.length + 1
  while (existingValues.includes(`Option ${n}`)) n++
  return `Option ${n}`
}
