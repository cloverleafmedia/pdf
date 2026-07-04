// Sorts form fields into standard reading order (top-to-bottom, then
// left-to-right) for keyboard Tab navigation - pdf.js returns AcroForm
// widgets in raw PDF /Annots array order, which frequently doesn't match
// visual layout (e.g. a form authored with fields added out of order).
// Pure and DOM/pdf.js-independent so it's directly unit-testable: takes any
// array of objects with numeric `top`/`left`, returns a new sorted array.
export function sortFieldsReadingOrder(fields) {
  return [...fields].sort((a, b) => a.top - b.top || a.left - b.left)
}
