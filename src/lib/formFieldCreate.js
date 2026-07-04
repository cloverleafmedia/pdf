// pdf-lib's form.createTextField(name)/createCheckBox(name) throw if a field
// with that name already exists - both against pre-existing AcroForm fields
// and against sibling drafts placed in the same session, so every new field
// needs a name that's actually unique before it reaches pdf-lib.

const TYPE_LABELS = { text: 'Textfeld', checkbox: 'Kontrollkästchen' }

export function defaultFieldName(type, index) {
  return `${TYPE_LABELS[type] || 'Feld'} ${index}`
}

export function dedupeFieldName(name, existingNames) {
  if (!existingNames.includes(name)) return name
  let n = 2
  while (existingNames.includes(`${name} (${n})`)) n++
  return `${name} (${n})`
}
