import { PDFDocument } from 'pdf-lib'
import { embedAppFont } from './embeddedFont.js'

// Builds the Comments Summary report (all annotations + reply threads,
// grouped by page) shown in CommentsSummaryModal.jsx, exported as plain text
// or as a generated PDF. Mirrors annotationFlatten.js's type coverage (the
// most complete existing reference - it already handles all 9 annotation
// types) rather than xfdfExport.js's, which only branches on a subset.

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

function wrapLines(text, font, size, maxWidth) {
  const words = text.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
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

const PAGE_W = 595.28, PAGE_H = 841.89 // A4 in points
const MARGIN = 50
const BODY_SIZE = 10
const HEADER_SIZE = 13
const LINE_HEIGHT = 14
const REPLY_INDENT = 16

// Generates a standalone PDF report - the same content as
// buildCommentsSummaryText(), but paginated with a simple manual line-flow
// (no existing pagination helper in this codebase to reuse; HeaderFooterModal.jsx
// only ever draws one fixed line per already-existing page, not a flowing
// multi-page document). embedFont is injectable with the same (doc, bold)
// signature as the real embedAppFont() (src/lib/embeddedFont.js), so tests
// can substitute a StandardFonts-based embedder instead of its network fetch -
// same pattern as annotationFlatten.js's embedFont parameter.
export async function buildCommentsSummaryPdf(annotations, embedFont = null) {
  const embed = embedFont || embedAppFont
  const doc = await PDFDocument.create()
  const regular = await embed(doc, false)
  const bold = await embed(doc, true)
  const maxWidth = PAGE_W - 2 * MARGIN

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }
  const drawLine = (text, font, size, indent = 0) => {
    ensureSpace(LINE_HEIGHT)
    page.drawText(text, { x: MARGIN + indent, y, size, font })
    y -= LINE_HEIGHT
  }

  const byPage = groupAnnotationsByPage(annotations)
  if (!byPage.length) {
    drawLine('Keine Anmerkungen in diesem Dokument.', regular, BODY_SIZE)
    return doc.save()
  }

  for (const [pageNum, items] of byPage) {
    ensureSpace(LINE_HEIGHT * 1.5)
    drawLine(`Seite ${pageNum}`, bold, HEADER_SIZE)
    y -= 4

    for (const a of items) {
      const label = TYPE_LABELS[a.type] || a.type
      const detail = annotationDetail(a)
      const headline = detail ? `${label}: ${detail}` : label
      for (const line of wrapLines(headline, regular, BODY_SIZE, maxWidth)) {
        drawLine(line, regular, BODY_SIZE)
      }
      for (const r of a.replies || []) {
        const replyText = `↳ ${new Date(r.time).toLocaleString('de-DE')}: ${r.text}`
        for (const line of wrapLines(replyText, regular, BODY_SIZE - 1, maxWidth - REPLY_INDENT)) {
          drawLine(line, regular, BODY_SIZE - 1, REPLY_INDENT)
        }
      }
    }
    y -= 8
  }

  return doc.save()
}
