// Verifies "PDF verschlüsseln" (EncryptModal.jsx / electron/main.js's
// pdf:encrypt handler) actually produces a correctly password-protected,
// correctly-permissioned file - not just that qpdf exits without error.
// pdf-lib can't read encrypted PDFs at all (the whole reason this feature
// shells out to qpdf in the first place), so verification also goes through
// the same bundled qpdf binary directly, via its --requires-password and
// --show-encryption inspection flags - independent of the app's own code path.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { PDFDocument } from 'pdf-lib'
import { launchApp } from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const QPDF = path.join(__dirname, '..', 'vendor', 'qpdf-runtime', 'bin', 'qpdf.exe')

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

async function makeBlankPdf() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const p = tmpPdfPath('encrypt-src')
  fs.writeFileSync(p, await doc.save())
  return p
}

// Runs the app's real IPC handler (same code path EncryptModal.jsx's "run()"
// uses) and returns the encrypted bytes as a Buffer - encryptPDF's ArrayBuffer
// result round-trips through Playwright's evaluate() serialization fine, but
// is converted to a plain byte array first to avoid relying on that.
async function encryptViaApp(window, srcPath, opts) {
  const bytes = fs.readFileSync(srcPath)
  const result = await window.evaluate(async ({ bytes, opts }) => {
    const r = await window.api.encryptPDF(new Uint8Array(bytes).buffer, opts)
    return { available: r.available, success: r.success, error: r.error, bytes: r.bytes ? Array.from(new Uint8Array(r.bytes)) : null }
  }, { bytes: Array.from(bytes), opts })
  return result
}

// execFileSync throws for ANY non-zero exit, which --requires-password always
// produces on success too (its own docs: 0 = wrong/no password supplied,
// 2 = file not encrypted, 3 = correct password supplied - never a shell-level
// "clean" 0 in the normal case) - so the real result always comes from the
// exception's exit code, not the try branch.
function requiresPasswordExitCode(filePath, password) {
  try {
    execFileSync(QPDF, password ? [`--password=${password}`, '--requires-password', filePath] : ['--requires-password', filePath])
    return 0
  } catch (e) {
    return typeof e.status === 'number' ? e.status : -1
  }
}

function showEncryption(filePath, password) {
  return execFileSync(QPDF, ['--show-encryption', `--password=${password}`, filePath]).toString('utf8')
}

describe('PDF encryption (qpdf)', () => {
  it('the encrypted file requires the exact user password to open', async () => {
    const src = await makeBlankPdf()
    const out = tmpPdfPath('encrypt-out')
    try {
      const result = await encryptViaApp(ctx.window, src, { userPassword: 'correcthorse', ownerPassword: '', allowPrint: true, allowCopy: true, allowModify: true })
      expect(result.available).toBe(true)
      expect(result.success).toBe(true)
      fs.writeFileSync(out, Buffer.from(result.bytes))

      expect(requiresPasswordExitCode(out, 'wrongpassword')).toBe(0) // wrong password rejected
      expect(requiresPasswordExitCode(out, 'correcthorse')).toBe(3)  // correct password accepted
      expect(requiresPasswordExitCode(out, null)).toBe(0)            // no password at all rejected
    } finally { fs.unlinkSync(src); fs.rmSync(out, { force: true }) }
  })

  it('an empty owner password falls back to the user password, not to "no restriction"', async () => {
    const src = await makeBlankPdf()
    const out = tmpPdfPath('encrypt-out')
    try {
      const result = await encryptViaApp(ctx.window, src, { userPassword: 'useronly', ownerPassword: '', allowPrint: false, allowCopy: false, allowModify: false })
      fs.writeFileSync(out, Buffer.from(result.bytes))

      // The user password must ALSO work as the owner password (the UI's own
      // "leer = gleich wie Öffnen-Passwort" promise) - if the fallback were
      // missing, an empty owner password could leave the file unrestricted
      // or require a *different*, never-communicated owner password.
      const info = showEncryption(out, 'useronly')
      expect(info).toContain('Supplied password is owner password')
      expect(info).toMatch(/print low resolution:\s*not allowed/)
      expect(info).toMatch(/modify anything:\s*not allowed/)
    } finally { fs.unlinkSync(src); fs.rmSync(out, { force: true }) }
  })

  it('permission checkboxes (print/copy/modify) map to the correct qpdf restrictions', async () => {
    const src = await makeBlankPdf()
    const out = tmpPdfPath('encrypt-out')
    try {
      const result = await encryptViaApp(ctx.window, src, { userPassword: 'pw123456', ownerPassword: 'owner123', allowPrint: true, allowCopy: false, allowModify: false })
      fs.writeFileSync(out, Buffer.from(result.bytes))

      const info = showEncryption(out, 'owner123')
      expect(info).toMatch(/print high resolution:\s*allowed/)
      expect(info).toMatch(/extract for any purpose:\s*not allowed/)
      expect(info).toMatch(/modify anything:\s*not allowed/)
    } finally { fs.unlinkSync(src); fs.rmSync(out, { force: true }) }
  })

  it('the app can actually open a file it just encrypted, via its own password prompt', async () => {
    // Interop check: qpdf produces the encryption, but pdf.js is what has to
    // decrypt it when the user re-opens the file - a mismatch between the two
    // (e.g. an unsupported /V or /R combination) would show up here even
    // though the qpdf-side checks above look fine in isolation.
    const src = await makeBlankPdf()
    const out = tmpPdfPath('encrypt-out')
    try {
      const result = await encryptViaApp(ctx.window, src, { userPassword: 'openme123', ownerPassword: '', allowPrint: true, allowCopy: true, allowModify: true })
      fs.writeFileSync(out, Buffer.from(result.bytes))

      // _loadPDF() resolves as soon as it registers the password callback -
      // it does NOT wait for the user to actually submit one - so this can't
      // use the openPdf() helper (which waits for the save button to enable,
      // which only happens after a correct password is submitted below).
      await ctx.window.evaluate((p) => window._loadPDF?.(p), out)
      await ctx.window.locator('input[type="password"]').waitFor({ timeout: 5000 })
      await ctx.window.locator('input[type="password"]').fill('openme123')
      await ctx.window.keyboard.press('Enter')

      await ctx.window.waitForFunction(() => {
        const btn = document.querySelector('button[title*="Speichern (Strg"]')
        return btn && !btn.disabled
      }, { timeout: 10000 })
    } finally { fs.unlinkSync(src); fs.rmSync(out, { force: true }) }
  })
})
