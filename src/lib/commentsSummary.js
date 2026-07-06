// Builds the Comments Summary report (all annotations + reply threads,
// grouped by page) shown in CommentsSummaryModal.jsx and exported as plain
// text. Mirrors annotationFlatten.js's type coverage (the most complete
// existing reference - it already handles all 9 annotation types) rather
// than xfdfExport.js's, which only branches on a subset.

export const TYPE_LABELS = {
  highlight: 'Markierung',
  underline: 'Unterstreichung',
  strikethrough: 'Durchstreichung',
  draw: 'Freihand-Zeichnung',
  note: 'Notiz',
  text: 'Textfeld',
  rectangle: 'Rechteck',
  circle: 'Kreis',
  arrow: 'Pfeil',
}

export function groupAnnotationsByPage(annotations) {
  const groups = {}
  for (const a of annotations) (groups[a.page] ||= []).push(a)
  return Object.entries(groups)
    .map(([page, items]) => [Number(page), items])
    .sort((a, b) => a[0] - b[0])
}

function annotationDetail(a) {
  if ((a.type === 'note' || a.type === 'text') && a.text) return a.text
  return null
}

export function buildCommentsSummaryText(annotations) {
  const byPage = groupAnnotationsByPage(annotations)
  if (!byPage.length) return 'Keine Anmerkungen in diesem Dokument.'

  const lines = []
  for (const [page, items] of byPage) {
    lines.push(`Seite ${page}`)
    lines.push('-'.repeat(`Seite ${page}`.length))
    for (const a of items) {
      const label = TYPE_LABELS[a.type] || a.type
      const detail = annotationDetail(a)
      lines.push(detail ? `- ${label}: ${detail}` : `- ${label}`)
      for (const r of a.replies || []) {
        lines.push(`    ↳ ${new Date(r.time).toLocaleString('de-DE')}: ${r.text}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
