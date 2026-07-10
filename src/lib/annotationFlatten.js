import { PDFDocument, PDFName, PDFHexString, TextAlignment, rgb, degrees } from 'pdf-lib'
import { setFormFieldValue } from './formFieldValue.js'
import { DATE_FIELD_MARKER, SIGNATURE_FIELD_MARKER } from './formFieldMarkers.js'
import { dataUrlToBytes } from './dataUrl.js'

// pdf-lib's drawImage/drawRectangle/drawText rotate around the given {x,y}
// origin, not the shape's own center - fine for a page-spanning diagonal
// watermark, but a small rotated stamp box would visibly swing out of its
// bounding box otherwise (and no longer match the CSS preview, which rotates
// around the element's center by default). Standard rotation-around-a-pivot
// formula: given a shape's own drawing origin, compute where that origin
// ends up if the whole stamp is rotated by `rotation` degrees around a
// shared pivot (the stamp box's center) - so a text-preset stamp's border
// rectangle and its centered text rotate together as one rigid unit rather
// than each spinning around its own, different center.
function rotatePointAroundPivot(x, y, cx, cy, rotation) {
  if (!rotation) return { x, y }
  const rad = (rotation * Math.PI) / 180
  const dx = x - cx, dy = y - cy
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad)
  return { x: cx + rx, y: cy + ry }
}

// Maps a point from on-screen "rotated" pixel space (y-down, origin top-left,
// size pageWpx x pageHpx - the CSS-pixel viewport the annotation was actually
// drawn on, at whatever page rotation/zoom was active) to the page's raw,
// always-un-rotated PDF content space (y-up, origin bottom-left, size rawW x
// rawH - what pdf-lib's page.getSize() returns). This is needed because
// pdf-lib's drawX() calls always operate in that raw content-stream space
// regardless of the page's own /Rotate entry: a PDF viewer rotates the
// ENTIRE rendered page (content + our annotations together) as one rigid
// unit at display time - it never touches the content stream's own
// coordinates. This is the inverse of pdf.js's page.getViewport({ rotation })
// transform, which is what actually produced the on-screen canvas the user
// drew on (see PDFViewer.jsx).
export function screenPointToRawPoint(screenX, screenY, pageWpx, pageHpx, rawW, rawH, rotation) {
  const rot  = ((rotation || 0) % 360 + 360) % 360
  const rotW = (rot === 90 || rot === 270) ? rawH : rawW
  const rotH = (rot === 90 || rot === 270) ? rawW : rawH
  const u = screenX * (rotW / pageWpx)
  const v = rotH - screenY * (rotH / pageHpx)
  if (rot === 90)  return { x: rawW - v, y: u }
  if (rot === 180) return { x: rawW - u, y: rawH - v }
  if (rot === 270) return { x: v, y: rawH - u }
  return { x: u, y: v }
}

// Transforms an axis-aligned screen-space rect's 4 corners and returns the
// resulting bounding box in raw PDF space. A 90°-multiple rotation never
// shears a rectangle, so the transformed corners still form an axis-aligned
// box - taking min/max reconstructs it regardless of which original corner
// ends up where.
export function screenRectToRawRect(rx, ry, rw, rh, pageWpx, pageHpx, rawW, rawH, rotation) {
  const corners = [
    [rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh],
  ].map(([x, y]) => screenPointToRawPoint(x, y, pageWpx, pageHpx, rawW, rawH, rotation))
  const xs = corners.map(c => c.x), ys = corners.map(c => c.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

// Zoom-to-point conversion factor for scalar magnitudes (line thickness,
// border width) that don't need corner/point remapping - rotation swaps
// which raw axis a screen axis maps to, but the ratio itself is the same
// either way (pageWpx/pageHpx keep the page's aspect ratio under rotation).
function screenScaleFactor(pageWpx, rawW, rawH, rotation) {
  const rot  = ((rotation || 0) % 360 + 360) % 360
  const rotW = (rot === 90 || rot === 270) ? rawH : rawW
  return rotW / pageWpx
}

// ── Flatten all UI annotations + form field values + newly-created form fields into PDF bytes via pdf-lib ──
// newFields: [{ page, type: 'text'|'checkbox', name, x, y, w, h, pageW, pageH }]
// in the same CSS-pixel space as `annotations` (name is expected to already
// be unique - the caller dedupes against known field names when the draft is
// placed; a stale collision here is simply skipped, same tolerance as formValues).
// embedFont is injectable so tests can substitute a StandardFonts-based
// embedder (no network fetch) instead of the real embedAppFont(). Loaded via
// dynamic import (not a static top-level one) when not injected, since this
// module sits on the core, non-lazy save path (PDFViewer.jsx) - a static
// import would pull fontkit + the bundled font asset into the main chunk for
// every save, not just the ones that actually draw a note/text annotation.
export async function flattenAnnotations(pdfBytes, annotations, formValues = {}, highlightOpacity = 0.35, newFields = [], embedFont = null, pageRotations = {}) {
  const hasFormValues   = Object.keys(formValues).length > 0
  const hasNewFields    = newFields.length > 0
  const hasPageRotation = Object.keys(pageRotations).length > 0
  if (!annotations.length && !hasFormValues && !hasNewFields && !hasPageRotation) return pdfBytes
  const doc  = await PDFDocument.load(pdfBytes)
  let font = null, boldFont = null
  // Separate cache for the bold weight - a single shared variable would either
  // wrongly reuse the regular-weight font for a bold annotation or re-embed
  // the bold font on every single bold annotation (bloating the saved PDF).
  const getFont = async (bold = false) => {
    if (bold) {
      if (!boldFont) {
        const embed = embedFont || (await import('./embeddedFont.js')).embedAppFont
        boldFont = await embed(doc, true)
      }
      return boldFont
    }
    if (!font) {
      const embed = embedFont || (await import('./embeddedFont.js')).embedAppFont
      font = await embed(doc, false)
    }
    return font
  }

  const hexRgb = (hex) => {
    const c = (hex || '#f59e0b').replace('#', '').padEnd(6, '0')
    return rgb(parseInt(c.slice(0,2),16)/255, parseInt(c.slice(2,4),16)/255, parseInt(c.slice(4,6),16)/255)
  }

  const byPage = {}
  for (const a of annotations) (byPage[a.page] = byPage[a.page] || []).push(a)

  for (const [pgStr, anns] of Object.entries(byPage)) {
    const pageIndex = Number(pgStr) - 1
    // doc.getPage() throws for an out-of-range index rather than returning
    // null, so the page count must be checked first — this guards against an
    // annotation left pointing at a page that was since deleted from the document.
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
    const page = doc.getPage(pageIndex)
    const { width: pw, height: ph } = page.getSize()
    // The rotation the annotation was actually drawn under (PDFViewer.jsx
    // records a.pageW/a.pageH from a viewport built with this same value) -
    // not necessarily today's pageRotations value if the user un-rotated
    // since, but that's the same "matches what was true at draw time"
    // assumption the rest of this function already makes for pageW/pageH.
    const rotation = pageRotations[pgStr] || 0

    for (const a of anns) {
      const pageWpx = a.pageW || pw
      const pageHpx = a.pageH || ph
      const toRawRect  = (rx, ry, rw, rh) => screenRectToRawRect(rx, ry, rw, rh, pageWpx, pageHpx, pw, ph, rotation)
      const toRawPoint = (px, py) => screenPointToRawPoint(px, py, pageWpx, pageHpx, pw, ph, rotation)
      const sx    = screenScaleFactor(pageWpx, pw, ph, rotation)
      const color = hexRgb(a.color)

      if (a.rects?.length) {
        for (const rect of a.rects) {
          const { x, y, width: w, height: h } = toRawRect(rect.x, rect.y, rect.w, rect.h)
          if (a.type === 'highlight') {
            page.drawRectangle({ x, y, width: w, height: h, color, opacity: highlightOpacity, borderWidth: 0 })
          } else if (a.type === 'underline') {
            page.drawLine({ start: { x, y: y + 1 }, end: { x: x + w, y: y + 1 }, thickness: 1.2, color })
          } else if (a.type === 'strikethrough') {
            const ly = y + h * 0.45
            page.drawLine({ start: { x, y: ly }, end: { x: x + w, y: ly }, thickness: 1.2, color })
          }
        }
      } else if (a.path?.length >= 2) {
        const lw = Math.max((a.width || 3) * sx, 0.5)
        for (let i = 1; i < a.path.length; i++) {
          const p0 = toRawPoint(a.path[i-1].x, a.path[i-1].y)
          const p1 = toRawPoint(a.path[i].x,   a.path[i].y)
          page.drawLine({ start: p0, end: p1, thickness: lw, color })
        }
      } else if ((a.type === 'note' || a.type === 'text') && a.text) {
        const f   = await getFont(a.type === 'text' && a.bold)
        const { x: tx, y: ty } = toRawPoint(a.x || 0, a.y || 0)
        const fSz = 9
        if (a.type === 'note') {
          page.drawRectangle({ x: tx, y: ty - 14, width: 14, height: 14, color: rgb(1,0.8,0), borderWidth: 0 })
          page.drawText(a.text.slice(0, 60), { x: tx + 16, y: ty - 10, size: fSz, font: f, color: rgb(0,0,0) })
        } else {
          const textFSz   = a.fontSize || fSz
          const textColor = a.color ? hexRgb(a.color) : rgb(0,0,0)
          const lines = a.text.split('\n').slice(0, 5)
          const boxW  = Math.max(...lines.map(l => f.widthOfTextAtSize(l.slice(0,35), textFSz)), 40) + 8
          const boxH  = lines.length * (textFSz * 1.4) + 6
          page.drawRectangle({ x: tx, y: ty-boxH, width: boxW, height: boxH, color: rgb(1,1,1), borderColor: rgb(0.5,0.5,0.5), borderWidth: 0.7, opacity: 0.95 })
          lines.forEach((line, i) => page.drawText(line.slice(0,35), { x: tx+4, y: ty - textFSz*1.4*(i+1)+2, size: textFSz, font: f, color: textColor }))
        }
      } else if (a.type === 'rectangle' || a.type === 'circle') {
        const { x, y, width: w, height: h } = toRawRect(a.x, a.y, a.w, a.h)
        const bw = Math.max((a.width || 2) * sx, 0.75)
        if (a.type === 'rectangle') {
          page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: bw })
        } else {
          page.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: Math.abs(w) / 2, yScale: Math.abs(h) / 2, borderColor: color, borderWidth: bw })
        }
      } else if (a.type === 'arrow') {
        const { x: x1, y: y1 } = toRawPoint(a.x1, a.y1)
        const { x: x2, y: y2 } = toRawPoint(a.x2, a.y2)
        const lw = Math.max((a.width || 2) * sx, 0.75)
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color })
        // Arrowhead: two short lines back from the tip, angled off the shaft's direction.
        const angle     = Math.atan2(y2 - y1, x2 - x1)
        const headLen   = 10
        const headAngle = Math.PI / 7
        page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - headLen * Math.cos(angle - headAngle), y: y2 - headLen * Math.sin(angle - headAngle) }, thickness: lw, color })
        page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - headLen * Math.cos(angle + headAngle), y: y2 - headLen * Math.sin(angle + headAngle) }, thickness: lw, color })
      } else if (a.type === 'stamp') {
        // The stamp's own `rotation` (user-set spin, independent of page
        // rotation) stays a plain content-stream `rotate` - it composes
        // correctly with the page's /Rotate automatically, since a PDF
        // viewer applies /Rotate to the whole already-rendered page as one
        // rigid unit; only the stamp's raw-space POSITION needs remapping.
        const { x, y, width: w, height: h } = toRawRect(a.x, a.y, a.w, a.h)
        const stampRotation = a.rotation || 0
        const cx = x + w / 2, cy = y + h / 2
        const rotate = stampRotation ? degrees(stampRotation) : undefined
        if (a.kind === 'custom' && a.imageBytes) {
          const isJpg = a.imageExt === 'jpg' || a.imageExt === 'jpeg'
          const image = isJpg ? await doc.embedJpg(a.imageBytes) : await doc.embedPng(a.imageBytes)
          const origin = rotatePointAroundPivot(x, y, cx, cy, stampRotation)
          page.drawImage(image, { x: origin.x, y: origin.y, width: w, height: h, rotate })
        } else {
          const f = await getFont()
          const bw = Math.max(3 * sx, 1)
          const rectOrigin = rotatePointAroundPivot(x, y, cx, cy, stampRotation)
          page.drawRectangle({ x: rectOrigin.x, y: rectOrigin.y, width: w, height: h, borderColor: color, borderWidth: bw, rotate })
          const text = a.text || ''
          const fSz = Math.min(h * 0.4, 24)
          const textW = f.widthOfTextAtSize(text, fSz)
          const textX = x + (w - textW) / 2, textY = y + h / 2 - fSz * 0.35
          const textOrigin = rotatePointAroundPivot(textX, textY, cx, cy, stampRotation)
          page.drawText(text, { x: textOrigin.x, y: textOrigin.y, size: fSz, font: f, color, rotate })
        }
      }
    }
  }

  if (hasFormValues || hasNewFields) {
    try {
      const form = doc.getForm() // auto-creates an empty AcroForm if the PDF doesn't have one yet

      if (hasFormValues) {
        for (const [key, value] of Object.entries(formValues)) {
          // Signature-field values are handled separately below (an embedded
          // PNG drawn onto the page, not an AcroForm /V string) - see the
          // signature-embedding block further down.
          if (value && typeof value === 'object' && value.__signatureDataUrl) continue
          try { setFormFieldValue(form, key, value) } catch (_) { /* field not found on this document, or wrong widget type — skip */ }
        }
      }

      if (hasNewFields) {
        // Radio-group members can't go through the one-draft-= one-`addToPage`
        // loop below: pdf-lib needs ONE createRadioGroup(name) call followed by
        // addOptionToPage(value, page, rect) per physical button, so they're
        // grouped by groupId and handled separately first.
        const radioGroups = {}
        for (const nf of newFields) {
          if (nf.type === 'radio') (radioGroups[nf.groupId] ||= []).push(nf)
        }
        for (const group of Object.values(radioGroups)) {
          try {
            const rg = form.createRadioGroup(group[0].name)
            // Required is one flag on the group's single pdf-lib field, not
            // per-widget - any member being marked required is enough (the UI
            // only ever surfaces the toggle on the group's first member, but
            // this stays robust even if that ever changes).
            if (group.some(nf => nf.required)) rg.enableRequired()
            for (const nf of group) {
              const pageIndex = nf.page - 1
              if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
              try {
                const page = doc.getPage(pageIndex)
                const { width: pw, height: ph } = page.getSize()
                const rotation = pageRotations[String(nf.page)] || 0
                const { x, y, width: w, height: h } = screenRectToRawRect(nf.x, nf.y, nf.w, nf.h, nf.pageW || pw, nf.pageH || ph, pw, ph, rotation)
                rg.addOptionToPage(nf.optionValue, page, { x, y, width: w, height: h })
              } catch (_) { /* out-of-range page or duplicate option value — skip this widget */ }
            }
          } catch (_) { /* name collision for the group's field name — skip the whole group */ }
        }

        for (const nf of newFields) {
          if (nf.type === 'radio') continue
          const pageIndex = nf.page - 1
          if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
          try {
            const page = doc.getPage(pageIndex)
            const { width: pw, height: ph } = page.getSize()
            const rotation = pageRotations[String(nf.page)] || 0
            const { x, y, width: w, height: h } = screenRectToRawRect(nf.x, nf.y, nf.w, nf.h, nf.pageW || pw, nf.pageH || ph, pw, ph, rotation)
            let field
            switch (nf.type) {
              case 'checkbox': field = form.createCheckBox(nf.name); break
              case 'dropdown': field = form.createDropdown(nf.name); if (nf.options?.length) field.addOptions(nf.options); break
              case 'listbox':  field = form.createOptionList(nf.name); if (nf.options?.length) field.addOptions(nf.options); break
              default:         field = form.createTextField(nf.name)
            }
            field.addToPage(page, { x, y, width: w, height: h })
            if (nf.required) field.enableRequired()
            // Date/signature fields are plain AcroForm text fields underneath
            // (the PDF spec has no dedicated widget type for either) - this
            // marker in /TU is how the fill-mode overlay recognizes them
            // again after a save+reload and renders a date picker / signature
            // button instead of a plain text input (see formFieldMarkers.js).
            // Must be set on the WIDGET annotation's own dict, not the
            // terminal field dict (field.acroField.dict) - pdf-lib creates
            // those as two separate dict objects even for a single-widget
            // field (linked via the widget's /Parent), and pdf.js reads /TU
            // with a direct `dict.get("TU")` on the annotation it's actually
            // parsing (the widget), not via inheritance from /Parent - a
            // marker set on the field dict alone is invisible to it.
            if (nf.type === 'date' || nf.type === 'signature') {
              const marker = nf.type === 'date' ? DATE_FIELD_MARKER : SIGNATURE_FIELD_MARKER
              for (const widget of field.acroField.getWidgets()) {
                widget.dict.set(PDFName.of('TU'), PDFHexString.fromText(marker))
              }
            }
            // Appearance properties from the "newfield" draft's own
            // properties panel (DraggableFieldBox) - text fields only, same
            // scope the panel itself is restricted to.
            if (nf.type === 'text') {
              if (nf.fontSize) field.setFontSize(nf.fontSize)
              if (nf.alignment === 'center') field.setAlignment(TextAlignment.Center)
              else if (nf.alignment === 'right') field.setAlignment(TextAlignment.Right)
              if (nf.multiline) field.enableMultiline()
              if (nf.defaultValue) field.setText(nf.defaultValue)
            }
          } catch (_) { /* name collision, out-of-range page, or other pdf-lib error — skip */ }
        }
      }
    } catch (_) { /* unexpected AcroForm error */ }
  }

  // Embed drawn signature-field values as an image on the page, at the exact
  // rect the field occupies - unlike every other field type, a signature
  // isn't representable as an AcroForm /V string, so it never goes through
  // setFormFieldValue above. `rect` here is already in raw PDF-unit space
  // (carried straight from pdf.js's own annotation.rect by the signature
  // widget when the user signed it - see PDFViewer.jsx), so no screen-to-raw
  // conversion is needed, unlike the newFields path above.
  if (hasFormValues) {
    for (const value of Object.values(formValues)) {
      if (!value || typeof value !== 'object' || !value.__signatureDataUrl) continue
      try {
        const pageIndex = value.page - 1
        if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
        const page = doc.getPage(pageIndex)
        const pngImage = await doc.embedPng(dataUrlToBytes(value.__signatureDataUrl))
        const [x1, y1, x2, y2] = value.rect
        page.drawImage(pngImage, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
      } catch (_) { /* malformed signature value or embed failure — skip */ }
    }
  }

  // Persist the user's own page rotations (rotatePageLeft/rotatePageRight in
  // the store) into the saved PDF itself - previously these only ever lived
  // in the in-memory pageRotations map and were silently discarded on save,
  // even though the UI marked the document as having unsaved changes.
  // pageRotations values are absolute (matching how the rest of the app
  // already treats them, e.g. page.getViewport({ rotation }) in
  // PDFViewer.jsx), so this is a direct set, not additive to whatever
  // rotation the page already had.
  for (const [pgStr, deg] of Object.entries(pageRotations)) {
    const pageIndex = Number(pgStr) - 1
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
    doc.getPage(pageIndex).setRotation(degrees(((deg % 360) + 360) % 360))
  }

  return doc.save()
}
