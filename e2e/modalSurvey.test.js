// Broad smoke test across every modal reachable without a native OS file
// dialog (Playwright can't drive those - see feedback_cloverleafpdf_e2e_testing
// memory). For each: open it, confirm the shared Modal overlay renders, close
// via Escape, confirm it's gone - while watching for renderer console errors
// throughout. Complements featureSurvey.test.js (interactive tool behavior).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { PDFDocument } from 'pdf-lib'
import { launchApp, openPdf } from './helpers.js'

let ctx
const consoleErrors = []

beforeAll(async () => {
  ctx = await launchApp()
  ctx.window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  ctx.window.on('pageerror', (err) => consoleErrors.push(String(err)))

  const doc = await PDFDocument.create()
  doc.addPage([600, 400])
  doc.addPage([600, 400])
  const p = path.join(os.tmpdir(), `cloverleaf-e2e-modals-${Date.now()}.pdf`)
  fs.writeFileSync(p, await doc.save())
  await openPdf(ctx.window, p)
  fs.unlinkSync(p)
}, 30000)

afterAll(async () => {
  await ctx?.close()
})

const MODAL_OVERLAY = 'div.fixed.inset-0.z-50'

async function closeModal(window) {
  await window.keyboard.press('Escape')
  await window.waitForTimeout(150)
  if (await window.locator(MODAL_OVERLAY).count() > 0) {
    await window.locator(MODAL_OVERLAY).locator('button').first().click({ timeout: 3000 }).catch(() => {})
    await window.waitForTimeout(150)
  }
}

async function openCloseCheck(window, clickIt) {
  await clickIt()
  await window.waitForTimeout(600) // first modal opened pays a one-time lazy-chunk-load cost
  const opened = await window.locator(MODAL_OVERLAY).count()
  expect(opened).toBeGreaterThan(0)
  await closeModal(window)
  const closed = await window.locator(MODAL_OVERLAY).count()
  expect(closed).toBe(0)
}

// Document-tool flyout items - label text as it appears in the "Dokument" menu.
// "PDFs vergleichen" is deliberately excluded: CompareView.jsx replaces the
// whole main view (not the shared Modal overlay), so it needs its own test
// shape rather than this generic open/close-via-Modal loop.
const FLYOUT_ITEMS = [
  'Seite beschneiden', 'Batch-Verarbeitung',
  'Wasserzeichen', 'Unterschrift', 'Kopf- & Fußzeile', 'Stempel',
  'QR-Code einfügen', 'Verschlüsseln', 'Dokument bereinigen', 'Signatur prüfen',
  'OCR', 'Komprimieren', 'Als Bilder exportieren', 'Tabellen als CSV exportieren',
  'Bilder zu PDF', 'PDF/A-Export', 'Barrierefreiheits-Check',
  'Kommentar-Zusammenfassung', 'Bibliothek', 'Serienbrief', 'Anhänge',
]

describe('Document-tool modals (via the "Dokument" flyout)', () => {
  for (const label of FLYOUT_ITEMS) {
    it(`opens and closes: ${label}`, async () => {
      await openCloseCheck(ctx.window, async () => {
        await ctx.window.locator('button[title="Dokument"]').click()
        await ctx.window.getByText(label, { exact: true }).click({ timeout: 5000 })
      })
    }, 10000)
  }
})

describe('Directly-triggered modals (own toolbar button)', () => {
  it('Settings modal opens and closes', async () => {
    await openCloseCheck(ctx.window, () => ctx.window.locator('button[title="Einstellungen"]').click())
  }, 10000)

  it('Properties modal opens and closes', async () => {
    await openCloseCheck(ctx.window, () => ctx.window.locator('button[title="Eigenschaften"]').click())
  }, 10000)

  it('Print dialog opens and closes', async () => {
    await openCloseCheck(ctx.window, () => ctx.window.locator('button[title="Drucken"]').click())
  }, 10000)

  it('Shortcuts modal opens and closes', async () => {
    await openCloseCheck(ctx.window, () => ctx.window.locator('button[title="Tastenkombinationen (?)"]').click())
  }, 10000)
})

describe('No unexpected console errors during the modal survey', () => {
  it('did not log any renderer console errors', () => {
    expect(consoleErrors, consoleErrors.join('\n---\n')).toEqual([])
  })
})
