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

function tmpPdfPath(label) {
  return path.join(os.tmpdir(), `cloverleaf-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
}

// Distinct page sizes per document so the merged result can be verified by
// which physical page ended up where, not just by count - same convention as
// pdfPageOps.test.js.
async function makePdf(sizes) {
  const doc = await PDFDocument.create()
  for (const s of sizes) doc.addPage([s, s])
  const p = tmpPdfPath('drop-src')
  fs.writeFileSync(p, await doc.save())
  return p
}

// Simulates an OS-level "drag a PDF from Explorer" drop onto a specific
// sidebar thumbnail's top or bottom half. Playwright has no native support
// for driving real OS file drag-and-drop, so this dispatches a real Chromium
// DragEvent/DataTransfer pair directly in the renderer - the same DOM APIs a
// genuine OS drop would produce, exercising the exact onDragOver/onDrop
// handlers in Sidebar.jsx rather than calling an internal JS bridge.
async function dropPdfOnThumb(window, pageNum, edge, filePath) {
  await window.evaluate(({ pageNum, edge, filePath }) => {
    const el = document.getElementById(`thumb-${pageNum}`)
    const rect = el.getBoundingClientRect()
    const clientY = edge === 'top' ? rect.top + 2 : rect.bottom - 2
    const file = new File([], 'insert.pdf', { type: 'application/pdf' })
    // Real OS drops give dropped File objects a `.path` (Electron extension,
    // already relied on elsewhere in this app - see App.jsx's global drop
    // handler) - not settable via the File constructor, so it's faked here.
    Object.defineProperty(file, 'path', { value: filePath })
    const dt = new DataTransfer()
    dt.items.add(file)
    const base = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY, dataTransfer: dt }
    el.dispatchEvent(new DragEvent('dragover', base))
    el.dispatchEvent(new DragEvent('drop', base))
  }, { pageNum, edge, filePath })
}

async function totalPagesText(window) {
  return window.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => /^\/\s*\d+$/.test(s.textContent.trim()))
    return el?.textContent.trim() || null
  })
}

describe('Sidebar drag-and-drop PDF insert', () => {
  it('inserts a dropped PDF at the exact drop position, not just at the end', async () => {
    const basePath = await makePdf([100, 101, 102]) // 3 pages
    const insertPath = await makePdf([500])          // 1 distinctly-sized page
    try {
      await openPdf(ctx.window, basePath)
      await ctx.window.waitForSelector('#thumb-3')

      // Drop on the bottom half of page 2 -> should land between page 2 and 3.
      await dropPdfOnThumb(ctx.window, 2, 'bottom', insertPath)
      await ctx.window.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('span'))
        return spans.some(s => s.textContent.trim() === '/ 4')
      }, { timeout: 10000 })

      expect(await totalPagesText(ctx.window)).toBe('/ 4')

      // Persist to disk and verify physical page order: 100,101,500,102.
      await ctx.window.evaluate(() => window._savePDF())
      const saved = await PDFDocument.load(fs.readFileSync(basePath))
      const widths = saved.getPages().map(p => p.getWidth())
      expect(widths).toEqual([100, 101, 500, 102])
    } finally {
      fs.unlinkSync(basePath)
      fs.unlinkSync(insertPath)
    }
  })

  it('dropping on the top half of the first page inserts before page 1', async () => {
    const basePath = await makePdf([200, 201])
    const insertPath = await makePdf([999])
    try {
      await openPdf(ctx.window, basePath)
      await ctx.window.waitForSelector('#thumb-1')

      await dropPdfOnThumb(ctx.window, 1, 'top', insertPath)
      await ctx.window.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('span'))
        return spans.some(s => s.textContent.trim() === '/ 3')
      }, { timeout: 10000 })

      await ctx.window.evaluate(() => window._savePDF())
      const saved = await PDFDocument.load(fs.readFileSync(basePath))
      const widths = saved.getPages().map(p => p.getWidth())
      expect(widths).toEqual([999, 200, 201])
    } finally {
      fs.unlinkSync(basePath)
      fs.unlinkSync(insertPath)
    }
  })
})
