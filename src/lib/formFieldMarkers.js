// Invisible-ish sentinels stored in a text field's /TU (tooltip / "alternate
// description") to remember a field's special app-level type across a
// save+reload round-trip. The PDF spec has no dedicated "date field" or
// "signature field" widget - both are really just plain AcroForm text fields
// underneath (see annotationFlatten.js), distinguished only by this marker,
// which pdf.js already exposes back as `alternativeText` on the annotation
// (the same property the fill overlay already used as a placeholder before
// these markers existed). Wrapped in U+2063 (invisible separator) so a
// marker that somehow leaked into a real tooltip display anywhere would be
// effectively invisible rather than a garbage string.
export const DATE_FIELD_MARKER = '⁣CLOVERLEAF_DATE⁣'
export const SIGNATURE_FIELD_MARKER = '⁣CLOVERLEAF_SIGNATURE⁣'
