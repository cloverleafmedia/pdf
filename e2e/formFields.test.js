import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PDFDocument } from 'pdf-lib'
import { launchApp, openPdf } from './helpers.js'

let ctx

beforeAll(async () => {
  ctx = await launchApp()
}, 30000)

afterAll(async () => {
  await ctx?.close()
})

async function activateFormTool(window) {
  // The toolbar button toggles form-mode on/off (setActiveTool(activeTool ===
  // 'form' ? 'hand' : 'form')) - clicking "Hand" first guarantees a known,
  // non-form baseline so a second/third test in this file (same shared app
  // instance) doesn't accidentally toggle form mode back off.
  await window.locator('button[title="Hand"]').click()
  await window.locator('button[title="Formular ausfüllen"]').click()
  await window.waitForTimeout(500) // let the formFields effect fetch+render widgets
}

describe('Form field fill regressions', () => {
  it('renders a multiline text field (PDF multiline flag set) as a textarea, not a single-line input', async () => {
    const fixturePath = 'C:\\Users\\maxim\\Downloads\\formblatt_z.pdf'
    expect(fs.existsSync(fixturePath)).toBe(true) // real-world fixture the bug was reported against

    await openPdf(ctx.window, fixturePath)
    await activateFormTool(ctx.window)

    const textareaCount = await ctx.window.locator('textarea').count()
    expect(textareaCount).toBeGreaterThan(0)
  })

  it('shows a pre-existing value from the PDF for a text field the user never touched', async () => {
    const tmpPath = path.join(os.tmpdir(), `cloverleaf-e2e-prefilled-${Date.now()}.pdf`)
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    const form = doc.getForm()
    const field = form.createTextField('vorname')
    field.setText('Max Mustermann')
    field.addToPage(page, { x: 20, y: 150, width: 200, height: 20 })
    fs.writeFileSync(tmpPath, await doc.save())

    try {
      await openPdf(ctx.window, tmpPath)
      await activateFormTool(ctx.window)

      // Scoped to the form-field overlay's own styling (not the toolbar's
      // page-number input, which also just an <input> and would otherwise
      // match first in DOM order).
      const value = await ctx.window.locator('input[class*="outline-blue-400"]').first().inputValue()
      expect(value).toBe('Max Mustermann')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })

  it('does not mark the document dirty just from displaying pre-existing PDF field values', async () => {
    const tmpPath = path.join(os.tmpdir(), `cloverleaf-e2e-prefilled-dirty-${Date.now()}.pdf`)
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    const form = doc.getForm()
    const field = form.createTextField('vorname')
    field.setText('Max Mustermann')
    field.addToPage(page, { x: 20, y: 150, width: 200, height: 20 })
    fs.writeFileSync(tmpPath, await doc.save())

    try {
      await openPdf(ctx.window, tmpPath)
      await activateFormTool(ctx.window)

      // TitleBar.jsx appends " •" to document.title when isDirty is true -
      // the visible proxy for the store's isDirty flag.
      const title = await ctx.window.title()
      expect(title).not.toContain('•')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })
})
