// Broad interactive functional survey across the core in-page tools (annotate,
// redact, form-fill, new-field, shapes). Complements formFields.test.js (which
// covers the two specific bugs from the last user report) and smoke.test.js
// (basic open/navigate). Each describe block reopens a fresh fixture PDF so
// the store's per-document reset (annotations/formValues/pendingRedactions/
// pendingFormFields all clear on openDocument) gives test isolation without
// needing a fresh Electron launch per group.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { launchApp, openPdf } from './helpers.js'

let ctx
const consoleErrors = []

beforeAll(async () => {
  ctx = await launchApp()
  ctx.window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  ctx.window.on('pageerror', (err) => consoleErrors.push(String(err)))
}, 30000)

afterAll(async () => {
  await ctx?.close()
})

function tmpPdfPath(label) {
  return path.join(os.tmpdir(), `cloverleaf-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
}

async function activateTool(window, title) {
  await window.locator(`button[title="${title}"]`).click()
}

async function openAnnotateFlyoutAndPick(window, label) {
  // "Anmerkungen" also labels a Sidebar tab - scope to the toolbar's own button.
  await window.locator('button[title="Anmerkungen"]').first().click()
  await window.getByText(label, { exact: true }).click()
}

async function isVisibleByText(window, textOrRegex) {
  return window.getByText(textOrRegex).first().isVisible().catch(() => false)
}

async function overlayCanvasSnapshot(window, pageNum = 1) {
  return window.evaluate((n) => {
    const wrap = document.getElementById(`page-${n}`)
    const canvas = wrap?.querySelectorAll('canvas')[1] // [0]=pdf render canvas, [1]=annotation overlay
    return canvas?.toDataURL()
  }, pageNum)
}

async function dragOnPage(window, pageNum, fx1, fy1, fx2, fy2) {
  const box = await window.locator(`#page-${pageNum}`).boundingBox()
  const x1 = box.x + box.width * fx1, y1 = box.y + box.height * fy1
  const x2 = box.x + box.width * fx2, y2 = box.y + box.height * fy2
  await window.mouse.move(x1, y1)
  await window.mouse.down()
  await window.mouse.move((x1 + x2) / 2, (y1 + y2) / 2)
  await window.mouse.move(x2, y2)
  await window.mouse.up()
}

async function makeTextPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  // Wide enough at this font size that the whole line stays within the page's
  // own rendered bounds - a line that overflows the page edge renders outside
  // the textLayer's box (position:absolute isn't clipped by the page wrapper's
  // overflow-visible), so a drag-to-select landing past the edge silently hits
  // no element and never starts a real text selection.
  const page = doc.addPage([1000, 400])
  page.drawText('Hello redact-target-word DE89370400440532013000 test@example.com 030-1234567', { x: 20, y: 350, size: 14, font })
  doc.addPage([1000, 400])
  const tmpPath = tmpPdfPath('text')
  fs.writeFileSync(tmpPath, await doc.save())
  return tmpPath
}

async function makeFormsPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const form = doc.getForm()

  // pdf-lib's addToPage() unconditionally resets the new widget's appearance
  // state to "Off" - check() must run AFTER the widget exists, or the field's
  // /V and the (only) widget's /AS end up mismatched.
  const checkbox = form.createCheckBox('agree')
  checkbox.addToPage(page, { x: 20, y: 250, width: 16, height: 16 })
  checkbox.check()

  const dropdown = form.createDropdown('country')
  dropdown.addOptions(['DE', 'AT', 'CH'])
  dropdown.select('AT')
  dropdown.addToPage(page, { x: 20, y: 200, width: 100, height: 20 })

  const radioGroup = form.createRadioGroup('gender')
  radioGroup.addOptionToPage('m', page, { x: 20, y: 150, width: 16, height: 16 })
  radioGroup.addOptionToPage('f', page, { x: 60, y: 150, width: 16, height: 16 })
  radioGroup.select('f')

  const tmpPath = tmpPdfPath('forms')
  fs.writeFileSync(tmpPath, await doc.save())
  return tmpPath
}

async function makeBlankPdf(pages = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([600, 400])
  const tmpPath = tmpPdfPath('blank')
  fs.writeFileSync(tmpPath, await doc.save())
  return tmpPath
}

describe('Text-selection annotate tools (highlight/underline/strikethrough)', () => {
  it('highlighting a text selection changes the overlay canvas', async () => {
    const p = await makeTextPdf()
    try {
      await openPdf(ctx.window, p)
      await openAnnotateFlyoutAndPick(ctx.window, 'Markieren')

      const spans = await ctx.window.evaluate(() => {
        const els = Array.from(document.querySelectorAll('#page-1 .textLayer span'))
        return els.filter(el => el.textContent?.trim()).map(el => {
          const r = el.getBoundingClientRect()
          return { x: r.left, y: r.top, w: r.width, h: r.height }
        })
      })
      expect(spans.length).toBeGreaterThan(0)
      const first = spans[0], last = spans[spans.length - 1]

      const before = await overlayCanvasSnapshot(ctx.window)
      await ctx.window.mouse.move(first.x + 2, first.y + first.h / 2)
      await ctx.window.mouse.down()
      await ctx.window.mouse.move(last.x + last.w - 2, last.y + last.h / 2)
      await ctx.window.mouse.up()
      await ctx.window.waitForTimeout(300)
      const after = await overlayCanvasSnapshot(ctx.window)

      expect(after).not.toBe(before)
    } finally { fs.unlinkSync(p) }
  })
})

describe('Freehand draw & shape tools', () => {
  it('draw tool marks the overlay canvas on drag', async () => {
    const p = await makeBlankPdf()
    try {
      await openPdf(ctx.window, p)
      await openAnnotateFlyoutAndPick(ctx.window, 'Zeichnen')
      const before = await overlayCanvasSnapshot(ctx.window)
      await dragOnPage(ctx.window, 1, 0.2, 0.2, 0.5, 0.5)
      await ctx.window.waitForTimeout(200)
      const after = await overlayCanvasSnapshot(ctx.window)
      expect(after).not.toBe(before)
    } finally { fs.unlinkSync(p) }
  })

  it('undo removes the last annotation, redo restores it (text-box annotation)', async () => {
    const p = await makeBlankPdf()
    try {
      await openPdf(ctx.window, p)
      await openAnnotateFlyoutAndPick(ctx.window, 'Textfeld')
      await ctx.window.locator('#page-1').click({ position: { x: 100, y: 100 } })
      await ctx.window.locator('textarea[placeholder="Text eingeben …"]').fill('E2E-Testtext')
      await ctx.window.keyboard.press('Control+Enter')

      expect(await ctx.window.getByText('E2E-Testtext', { exact: true }).count()).toBe(1)

      await activateTool(ctx.window, 'Rückgängig (Strg+Z)')
      expect(await ctx.window.getByText('E2E-Testtext', { exact: true }).count()).toBe(0)

      await activateTool(ctx.window, 'Wiederholen (Strg+Y)')
      expect(await ctx.window.getByText('E2E-Testtext', { exact: true }).count()).toBe(1)
    } finally { fs.unlinkSync(p) }
  })

  it('rectangle shape tool marks the overlay canvas on drag', async () => {
    const p = await makeBlankPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Form einfügen (Rechteck/Kreis/Pfeil)')
      const before = await overlayCanvasSnapshot(ctx.window)
      await dragOnPage(ctx.window, 1, 0.2, 0.2, 0.6, 0.6)
      await ctx.window.waitForTimeout(200)
      const after = await overlayCanvasSnapshot(ctx.window)
      expect(after).not.toBe(before)
    } finally { fs.unlinkSync(p) }
  })
})

describe('Redaction workflow', () => {
  it('drawing a redaction rectangle updates the pending-count bar', async () => {
    const p = await makeTextPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Schwärzen')
      await dragOnPage(ctx.window, 1, 0.05, 0.7, 0.3, 0.8)
      expect(await isVisibleByText(ctx.window, /1 Schwärzung\(en\) ausstehend/)).toBe(true)
    } finally { fs.unlinkSync(p) }
  })

  it('search & mark finds a known text string', async () => {
    const p = await makeTextPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Schwärzen')
      await ctx.window.locator('input[placeholder="Suchbegriff …"]').fill('redact-target-word')
      await ctx.window.getByText('Suchen & markieren').click()
      await ctx.window.waitForTimeout(1000)
      expect(await isVisibleByText(ctx.window, /\d+ Schwärzung\(en\) ausstehend/)).toBe(true)
    } finally { fs.unlinkSync(p) }
  })

  it('auto-detect PII finds the embedded IBAN/e-mail/phone number', async () => {
    const p = await makeTextPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Schwärzen')
      await ctx.window.getByText('IBAN/E-Mail/Telefon erkennen').click()
      await ctx.window.waitForTimeout(1000)
      expect(await isVisibleByText(ctx.window, /\d+ Schwärzung\(en\) ausstehend/)).toBe(true)
    } finally { fs.unlinkSync(p) }
  })
})

describe('Page rotation persistence', () => {
  it('rotating a page and saving actually persists the rotation to disk', async () => {
    const p = await makeBlankPdf()
    try {
      await openPdf(ctx.window, p)
      await ctx.window.locator('button[title="Rechts drehen"]').click()
      // window._savePDF() is async - evaluate() awaits the returned promise,
      // so this doesn't resolve until the file write has actually completed.
      await ctx.window.evaluate(() => window._savePDF())

      const savedBytes = fs.readFileSync(p)
      const doc = await PDFDocument.load(savedBytes)
      expect(doc.getPage(0).getRotation().angle).toBe(90)
    } finally { fs.unlinkSync(p) }
  })
})

describe('Form field pre-fill across all field types', () => {
  it('shows pre-existing checkbox/dropdown/radio values from the PDF', async () => {
    const p = await makeFormsPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Hand')
      await activateTool(ctx.window, 'Formular ausfüllen')
      await ctx.window.waitForTimeout(500)

      const checkboxChecked = await ctx.window.locator('input[type="checkbox"]').first().isChecked()
      expect(checkboxChecked).toBe(true)

      const dropdownValue = await ctx.window.locator('select').first().inputValue()
      expect(dropdownValue).toBe('AT')

      const radioChecked = await ctx.window.locator('input[type="radio"]').nth(1).isChecked()
      expect(radioChecked).toBe(true)

      // Pre-fill must not mark the doc dirty (TitleBar appends " •" when isDirty)
      const title = await ctx.window.title()
      expect(title).not.toContain('•')
    } finally { fs.unlinkSync(p) }
  })
})

describe('New form-field creation', () => {
  it('drag-creates a checkbox draft with an editable default name', async () => {
    const p = await makeBlankPdf()
    try {
      await openPdf(ctx.window, p)
      await activateTool(ctx.window, 'Formularfeld erstellen')
      await ctx.window.getByText('Kontrollkästchen', { exact: true }).click()
      await dragOnPage(ctx.window, 1, 0.3, 0.3, 0.4, 0.35)

      const nameInputs = ctx.window.locator('div.border-dashed input')
      expect(await nameInputs.count()).toBe(1)
      const value = await nameInputs.first().inputValue()
      expect(value.length).toBeGreaterThan(0)
    } finally { fs.unlinkSync(p) }
  })
})

describe('No unexpected console errors during this survey', () => {
  it('did not log any renderer console errors', () => {
    expect(consoleErrors, consoleErrors.join('\n---\n')).toEqual([])
  })
})
