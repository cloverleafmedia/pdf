import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { assertExtension, isPathDenied, getInitialFile, scanFolder, LIBRARY_SCAN_LIMIT, LIBRARY_SCAN_DEPTH } from './mainUtils.js'

describe('assertExtension', () => {
  const allowed = new Set(['.pdf', '.csv'])

  it('accepts an allowed extension', () => {
    expect(() => assertExtension('C:/docs/file.pdf', allowed)).not.toThrow()
  })

  it('is case-insensitive', () => {
    expect(() => assertExtension('C:/docs/FILE.PDF', allowed)).not.toThrow()
  })

  it('rejects a disallowed extension', () => {
    expect(() => assertExtension('C:/docs/file.exe', allowed)).toThrow(/nicht erlaubt/)
  })
})

describe('isPathDenied', () => {
  const denied = [path.join('C:', 'Program Files', 'CloverleafPDF', 'resources')]

  it('denies a path exactly matching a denied root', () => {
    expect(isPathDenied(denied[0], denied)).toBe(true)
  })

  it('denies a path nested inside a denied root', () => {
    expect(isPathDenied(path.join(denied[0], 'app.asar'), denied)).toBe(true)
  })

  it('allows a sibling path that merely shares a string prefix', () => {
    // "CloverleafPDF-Backup" starts with the same characters as "CloverleafPDF"
    // but is a different directory - a naive startsWith(root) check (without
    // path.sep) would wrongly deny this.
    const sibling = path.join('C:', 'Program Files', 'CloverleafPDF-Backup', 'file.pdf')
    expect(isPathDenied(sibling, denied)).toBe(false)
  })

  it('allows an unrelated path', () => {
    expect(isPathDenied(path.join('C:', 'Users', 'max', 'Documents', 'file.pdf'), denied)).toBe(false)
  })

  it('resolves ".." segments before comparing', () => {
    const escaped = path.join(denied[0], '..', '..', 'Users', 'max', 'file.pdf')
    expect(isPathDenied(escaped, denied)).toBe(false)
  })

  it('ignores falsy roots (e.g. an undefined process.resourcesPath in some environments)', () => {
    expect(isPathDenied('C:/Users/max/file.pdf', [undefined, null, ''])).toBe(false)
  })
})

describe('getInitialFile', () => {
  let tmpDir

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  })

  function makeTmpPdf() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-test-'))
    const pdfPath = path.join(tmpDir, 'doc.pdf')
    fs.writeFileSync(pdfPath, 'dummy')
    return pdfPath
  }

  it('finds a .pdf argument in packaged argv shape (exe, file)', () => {
    const p = makeTmpPdf()
    expect(getInitialFile(['CloverleafPDF.exe', p], false)).toBe(p)
  })

  it('finds a .pdf argument in dev argv shape (electron, main.js, file)', () => {
    const p = makeTmpPdf()
    expect(getInitialFile(['electron.exe', 'main.js', p], true)).toBe(p)
  })

  it('ignores flags starting with -', () => {
    const p = makeTmpPdf()
    expect(getInitialFile(['CloverleafPDF.exe', '--some-flag', p], false)).toBe(p)
  })

  it('returns null when the file does not exist on disk', () => {
    expect(getInitialFile(['CloverleafPDF.exe', 'C:/does/not/exist.pdf'], false)).toBeNull()
  })

  it('returns null when there is no .pdf argument', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-test-'))
    const txtPath = path.join(tmpDir, 'notes.txt')
    fs.writeFileSync(txtPath, 'dummy')
    expect(getInitialFile(['CloverleafPDF.exe', txtPath], false)).toBeNull()
  })
})

describe('scanFolder', () => {
  let tmpDir

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  })

  it('finds .pdf files recursively and ignores other extensions', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-scan-'))
    fs.writeFileSync(path.join(tmpDir, 'a.pdf'), 'x')
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'x')
    const sub = path.join(tmpDir, 'sub')
    fs.mkdirSync(sub)
    fs.writeFileSync(path.join(sub, 'c.pdf'), 'x')

    const results = []
    scanFolder(tmpDir, results)
    expect(results.map(r => r.name).sort()).toEqual(['a.pdf', 'c.pdf'])
  })

  it('stops descending past LIBRARY_SCAN_DEPTH levels', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-scan-depth-'))
    let dir = tmpDir
    for (let i = 0; i <= LIBRARY_SCAN_DEPTH + 2; i++) {
      dir = path.join(dir, `d${i}`)
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, `f${i}.pdf`), 'x')
    }

    const results = []
    scanFolder(tmpDir, results)
    // Only directories up to and including LIBRARY_SCAN_DEPTH are walked.
    expect(results.length).toBeLessThanOrEqual(LIBRARY_SCAN_DEPTH + 1)
    expect(results.length).toBeGreaterThan(0)
  })

  it('stops once LIBRARY_SCAN_LIMIT results have been collected', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-scan-limit-'))
    const results = new Array(LIBRARY_SCAN_LIMIT).fill({ name: 'existing.pdf' })
    fs.writeFileSync(path.join(tmpDir, 'extra.pdf'), 'x')

    scanFolder(tmpDir, results)
    expect(results.length).toBe(LIBRARY_SCAN_LIMIT)
  })
})
