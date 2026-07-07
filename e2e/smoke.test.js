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

describe('CloverleafPDF smoke test (real Electron window via Playwright)', () => {
  it('shows the start screen with no document open', async () => {
    const title = await ctx.window.title()
    expect(title).toBe('CloverleafPDF')

    const openButtonVisible = await ctx.window.getByText('PDF öffnen').isVisible()
    expect(openButtonVisible).toBe(true)
  })

  it('opens a real PDF and updates the toolbar/page-count state', async () => {
    const tmpPath = path.join(os.tmpdir(), `cloverleaf-e2e-${Date.now()}.pdf`)
    const doc = await PDFDocument.create()
    doc.addPage([300, 400])
    doc.addPage([300, 400])
    fs.writeFileSync(tmpPath, await doc.save())

    try {
      await openPdf(ctx.window, tmpPath)

      const saveEnabled = await ctx.window.locator('button[title*="Speichern (Strg"]').isEnabled()
      expect(saveEnabled).toBe(true)

      const pageCountText = await ctx.window.evaluate(() => {
        const el = Array.from(document.querySelectorAll('span')).find((s) => s.textContent?.trim().startsWith('/'))
        return el?.textContent?.trim()
      })
      expect(pageCountText).toBe('/ 2')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })
})
