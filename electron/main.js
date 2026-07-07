const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, net } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const crypto = require('crypto')
const { execFile } = require('child_process')
const { assertExtension, isPathDenied, getInitialFile, scanFolder, LIBRARY_SCAN_LIMIT } = require('./mainUtils')

const isDev = !app.isPackaged

// ── Single-instance lock ───────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow

// ── Auto-updater (only in production) ─────────────────────────────────────
let autoUpdater
if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
  } catch (_) {}
}

// When a second instance is launched (e.g. user double-clicks another PDF),
// focus the existing window and open the file.
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const file = getInitialFile(argv, isDev)
    if (file) mainWindow.webContents.send('open-file', file)
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1440,
    height:   900,
    minWidth: 960,
    minHeight: 600,
    frame:    false,
    backgroundColor: '#09090f',
    icon:     path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      !isDev,
    },
  })

  mainWindow.on('maximize',    () => mainWindow.webContents.send('window-state-change', true))
  mainWindow.on('unmaximize',  () => mainWindow.webContents.send('window-state-change', false))
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-change', true))
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-change', false))

  // Defense-in-depth: nothing today renders clickable links from a PDF
  // (PDFViewer.jsx only calls page.getAnnotations() for form-field discovery,
  // never a pdf.js AnnotationLayer/link surface), but a malicious PDF or a
  // future feature could introduce one - so navigation away from the app's
  // own UI, and any attempt to spawn a new window, is blocked by default and
  // routed to the OS browser instead.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith('http://localhost:5173')) return
    if (url.startsWith('file://')) return
    e.preventDefault()
    shell.openExternal(url)
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Pushes live OS theme changes to the renderer - only applied there when
  // the user has opted into "System" theme mode (see useStore.js themeMode).
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors)
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Send initial file (opened via double-click / "Open with") once the renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    const file = getInitialFile(process.argv, isDev)
    if (file) mainWindow.webContents.send('open-file', file)
  })

  // Auto-updater events
  if (autoUpdater) {
    autoUpdater.on('update-available',  () => mainWindow.webContents.send('update-available'))
    autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('update-downloaded'))
    autoUpdater.on('error', (err) => console.error('Updater error:', err.message))
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── Window controls ────────────────────────────────────────────────────────
ipcMain.handle('win:minimize',        () => mainWindow.minimize())
ipcMain.handle('win:maximize',        () => { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize() })
ipcMain.handle('win:close',           () => mainWindow.close())
ipcMain.handle('win:isMaximized',     () => mainWindow.isMaximized())
ipcMain.handle('win:toggleFullscreen',() => mainWindow.setFullScreen(!mainWindow.isFullScreen()))
// Printer list for the in-app "choose a printer" dialog — the user explicitly
// asked to pick a printer every time rather than always defaulting to the
// Windows default (or an auto-picked fallback when there's no default).
ipcMain.handle('win:getPrinters', async () => {
  const printers = await mainWindow.webContents.getPrintersAsync()
  return printers.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }))
})

// On Windows, Chromium's print backend fails with "Invalid printer settings"
// whenever no printer is marked as the OS default — even if a deviceName is
// passed explicitly. This is a Chromium/Windows quirk, not something fixable
// from here, so the best we can do is detect it and tell the user exactly
// what to do instead of failing silently ("nothing happens" when clicking Print).
//
// `opts.silent` controls whether the native Windows print dialog opens on top
// of our own in-app one: true (default) prints immediately using the
// printer/page-range/copies chosen in-app; false opens the full native dialog
// (for printer-driver-specific settings — color, duplex, paper tray — that we
// have no cross-driver way to expose ourselves) with those as the starting point.
ipcMain.handle('win:print', async (_, opts = {}) => {
  // Default to silent (direct print with the in-app settings) unless the
  // caller explicitly asks for the native dialog via { silent: false }.
  const { deviceName, pageRanges, copies, silent = true } = opts
  const printers = await mainWindow.webContents.getPrintersAsync()
  if (!printers.length) {
    return { success: false, reason: 'Kein Drucker gefunden. Bitte einen Drucker in den Windows-Einstellungen einrichten.' }
  }
  // deviceName comes from the printer-selection dialog the user just confirmed;
  // only fall back to auto-picking one if it's somehow missing/no longer valid.
  const target = printers.find(p => p.name === deviceName) || printers.find(p => p.isDefault) || printers[0]
  const printOptions = { silent, printBackground: true, deviceName: target.name }
  if (Array.isArray(pageRanges) && pageRanges.length) printOptions.pageRanges = pageRanges
  if (copies && copies > 1) printOptions.copies = copies
  return new Promise((resolve) => {
    mainWindow.webContents.print(printOptions, (success, reason) => {
      if (!success && reason === 'Invalid printer settings') {
        resolve({ success, reason: 'Kein Standarddrucker festgelegt. Bitte in den Windows-Druckereinstellungen einen Standarddrucker auswählen (z. B. "Microsoft Print to PDF") und erneut versuchen.' })
      } else {
        resolve({ success, reason })
      }
    })
  })
})
ipcMain.handle('win:installUpdate',   () => autoUpdater?.quitAndInstall())

// ── Theme ──────────────────────────────────────────────────────────────────
ipcMain.handle('theme:getSystem', () => nativeTheme.shouldUseDarkColors)

// ── Locale ─────────────────────────────────────────────────────────────────
ipcMain.handle('locale:getSystem', () => app.getLocale())

// ── File dialogs ───────────────────────────────────────────────────────────
ipcMain.handle('dialog:openPDF', () => dialog.showOpenDialog(mainWindow, {
  title: 'PDF öffnen',
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'PDF-Dokumente', extensions: ['pdf'] }],
}))

ipcMain.handle('dialog:savePDF', (_, defaultName) => dialog.showSaveDialog(mainWindow, {
  title: 'PDF speichern',
  defaultPath: defaultName || 'dokument.pdf',
  filters: [{ name: 'PDF-Dokumente', extensions: ['pdf'] }],
}))

ipcMain.handle('dialog:openCert', () => dialog.showOpenDialog(mainWindow, {
  title: 'Zertifikat auswählen',
  properties: ['openFile'],
  filters: [{ name: 'PKCS#12-Zertifikat', extensions: ['p12', 'pfx'] }],
}))

ipcMain.handle('dialog:openCSV', () => dialog.showOpenDialog(mainWindow, {
  title: 'CSV-Datei auswählen',
  properties: ['openFile'],
  filters: [{ name: 'CSV-Dateien', extensions: ['csv'] }],
}))

ipcMain.handle('dialog:openXFDF', () => dialog.showOpenDialog(mainWindow, {
  title: 'XFDF/FDF-Datei auswählen',
  properties: ['openFile'],
  filters: [{ name: 'XFDF/FDF-Dateien', extensions: ['xfdf', 'fdf'] }],
}))

ipcMain.handle('dialog:pickFolder', (_, title) => dialog.showOpenDialog(mainWindow, {
  title: title || 'Ordner auswählen',
  properties: ['openDirectory'],
}))

ipcMain.handle('dialog:openImages', () => dialog.showOpenDialog(mainWindow, {
  title: 'Bilder auswählen',
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg'] }],
}))

// Attachments can be of any file type (docx, zip, xlsx, ...) - unlike every
// other dialog above, this one is intentionally unfiltered.
ipcMain.handle('dialog:openAttachment', () => dialog.showOpenDialog(mainWindow, {
  title: 'Datei als Anhang auswählen',
  properties: ['openFile'],
  filters: [{ name: 'Alle Dateien', extensions: ['*'] }],
}))

ipcMain.handle('dialog:saveAttachment', (_, defaultName) => dialog.showSaveDialog(mainWindow, {
  title: 'Anhang speichern unter',
  defaultPath: defaultName || 'anhang',
  filters: [{ name: 'Alle Dateien', extensions: ['*'] }],
}))

// ── File I/O ───────────────────────────────────────────────────────────────
// Extension allowlist: renderer-controlled paths must not be able to read/write
// arbitrary files on disk (defense in depth in case of a future renderer compromise).
const READABLE_EXTENSIONS = new Set(['.pdf', '.csv', '.png', '.jpg', '.jpeg', '.xfdf', '.fdf'])
const WRITABLE_EXTENSIONS  = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt'])

// Even a matching-extension path must not resolve inside the app's own
// install/resource directories - no legitimate feature ever reads/writes
// there via these generic channels, so this can only ever reject a
// compromised-renderer attempt to tamper with (or exfiltrate) the app itself.
const DENIED_ROOTS = [app.getAppPath(), process.resourcesPath]

ipcMain.handle('fs:read', (_, filePath) => {
  const resolved = path.resolve(filePath)
  assertExtension(resolved, READABLE_EXTENSIONS)
  if (isPathDenied(resolved, DENIED_ROOTS)) throw new Error('Zugriff auf diesen Pfad ist nicht erlaubt.')
  const data = fs.readFileSync(resolved)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})

ipcMain.handle('fs:write', (_, filePath, data) => {
  const resolved = path.resolve(filePath)
  assertExtension(resolved, WRITABLE_EXTENSIONS)
  if (isPathDenied(resolved, DENIED_ROOTS)) throw new Error('Zugriff auf diesen Pfad ist nicht erlaubt.')
  fs.writeFileSync(resolved, Buffer.from(data))
  return true
})

// Attachment-only counterparts to fs:read/fs:write: deliberately skip the
// extension allowlist above (attachments can be any file type), but keep the
// same install-directory denial check - narrowly scoped to this one feature
// rather than loosening the general-purpose fs:read/fs:write allowlist.
ipcMain.handle('fs:readAttachment', (_, filePath) => {
  const resolved = path.resolve(filePath)
  if (isPathDenied(resolved, DENIED_ROOTS)) throw new Error('Zugriff auf diesen Pfad ist nicht erlaubt.')
  const data = fs.readFileSync(resolved)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})

ipcMain.handle('fs:writeAttachment', (_, filePath, data) => {
  const resolved = path.resolve(filePath)
  if (isPathDenied(resolved, DENIED_ROOTS)) throw new Error('Zugriff auf diesen Pfad ist nicht erlaubt.')
  fs.writeFileSync(resolved, Buffer.from(data))
  return true
})

ipcMain.handle('fs:exists', (_, filePath) => fs.existsSync(filePath))

ipcMain.handle('shell:showInFolder', (_, filePath) => shell.showItemInFolder(filePath))

// ── Digital signature (PKCS#12 certificate) ─────────────────────────────────
// Runs entirely in the main process: node-forge/@signpdf are Node-only, and
// keeping the certificate file + its password out of the renderer entirely
// (the renderer only ever sees a file path, chosen via dialog:openCert) is a
// deliberate defense-in-depth choice, same spirit as the fs read/write allowlist.
// Electron's net.request (not Node's raw https/http) so the TSA request
// respects the system/corporate proxy config a packaged Windows app may run
// behind; explicit timeout since neither module has one by default and an
// unreachable TSA would otherwise hang the whole signing operation.
function postTsq(url, tsqDerBytes, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'POST', url })
    request.setHeader('Content-Type', 'application/timestamp-query')
    request.setHeader('Accept', 'application/timestamp-reply')
    const timer = setTimeout(() => { request.abort(); reject(new Error('Zeitüberschreitung bei der Zeitstempel-Anfrage.')) }, timeoutMs)
    request.on('response', (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        clearTimeout(timer)
        if (response.statusCode !== 200) {
          reject(new Error(`Zeitstempel-Server antwortete mit HTTP ${response.statusCode}.`))
          return
        }
        resolve(Buffer.concat(chunks))
      })
      response.on('error', (err) => { clearTimeout(timer); reject(err) })
    })
    request.on('error', (err) => { clearTimeout(timer); reject(err) })
    request.write(tsqDerBytes)
    request.end()
  })
}

async function signPdf(pdfBytes, certPath, password, meta) {
  try {
    assertExtension(certPath, new Set(['.p12', '.pfx']))
    const { PDFDocument } = require('pdf-lib')
    const { plainAddPlaceholder } = require('@signpdf/placeholder-plain')
    const signpdf = require('@signpdf/signpdf').default
    const { P12Signer } = require('@signpdf/signer-p12')

    const wantsTimestamp = !!meta?.timestamp

    // @signpdf's placeholder logic expects a classic (plain-text) xref table;
    // pdf-lib's default .save() uses compressed xref streams, which it can't
    // parse ("Expected xref at NaN but found other content"). Re-saving without
    // object streams first makes this work regardless of how the PDF was built.
    const doc = await PDFDocument.load(pdfBytes)
    const classicBytes = await doc.save({ useObjectStreams: false })

    const certBuffer = fs.readFileSync(certPath)
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: Buffer.from(classicBytes),
      reason:   meta?.reason   || '',
      name:     meta?.name     || '',
      location: meta?.location || '',
      // A timestamp token embeds the TSA's own certificate chain (several KB) -
      // must be reserved upfront, since the placeholder can't grow after
      // signpdf.sign() below. Left at @signpdf's own default (8192) otherwise.
      ...(wantsTimestamp ? { signatureLength: 32768 } : {}),
    })
    const signer = new P12Signer(certBuffer, { passphrase: password || '' })
    let signed = await signpdf.sign(pdfWithPlaceholder, signer)

    if (wantsTimestamp) {
      const rfc3161 = require('./rfc3161')
      const forge = require('node-forge')
      const { findSignatureDicts } = await import('../src/lib/pdfSignatureFields.js')

      // signpdf.lastSignature (hex of the just-produced, unpadded CMS bytes)
      // avoids re-parsing the signed PDF for the original signature value.
      const cmsBytes = Buffer.from(signpdf.lastSignature, 'hex')
      const signatureValueBytes = rfc3161.extractSignatureValue(cmsBytes)

      const digest = forge.md.sha256.create()
      digest.update(signatureValueBytes.toString('binary'))
      const hashBytes = Buffer.from(digest.digest().bytes(), 'binary')

      const tsaUrl = meta?.tsaUrl || 'http://timestamp.digicert.com'
      const { timeStampTokenAsn1 } = await rfc3161.requestTimestamp(tsaUrl, hashBytes, postTsq)
      const augmentedCms = rfc3161.augmentSignerInfoWithTimestamp(cmsBytes, timeStampTokenAsn1)

      // Locate the already-finalized /ByteRange/placeholder on the just-signed
      // PDF (read-only load - re-saving via pdf-lib here would rewrite the
      // xref/object structure and shift every byte offset, silently
      // corrupting the file) and splice the larger, timestamped CMS into the
      // exact same reserved slot, replicating signpdf.js's own patch logic.
      const readDoc = await PDFDocument.load(signed)
      const [sigDict] = findSignatureDicts(readDoc)
      if (!sigDict) throw new Error('Signatur-Platzhalter nach dem Signieren nicht gefunden.')
      const [, placeholderStart, placeholderEnd] = sigDict.byteRange
      const placeholderLength = (placeholderEnd - placeholderStart) - 2 // hex chars, minus the < > brackets
      const newHex = augmentedCms.toString('hex')
      if (newHex.length > placeholderLength) {
        throw new Error(`Zeitstempel-Signatur ist größer als der reservierte Platz (${newHex.length} > ${placeholderLength}).`)
      }
      const paddedHex = newHex + '0'.repeat(placeholderLength - newHex.length)
      signed = Buffer.concat([
        signed.slice(0, placeholderStart + 1),
        Buffer.from(paddedHex, 'ascii'),
        signed.slice(placeholderEnd - 1),
      ])
    }

    return { success: true, bytes: signed.buffer.slice(signed.byteOffset, signed.byteOffset + signed.byteLength) }
  } catch (e) {
    return { success: false, error: e.message || 'Unbekannter Fehler' }
  }
}

ipcMain.handle('sign:pdf', (_, pdfBytes, certPath, password, meta) => signPdf(pdfBytes, certPath, password, meta))

// ── Digital signature verification ──────────────────────────────────────────
// node-forge can *sign* PKCS#7 (used above) but not verify it - see the long
// comment at the top of pkcs7Verify.js for why this needed hand-rolled ASN.1
// decoding instead of a library call. This is the first place electron/*.js
// imports from src/lib/*.js (both pdfSignatureFields.js and
// signatureVerifyFormat.js are plain pdf-lib/pure-JS logic with no browser
// dependency, so they're safe to reuse here via dynamic import rather than
// duplicating them as CommonJS).
async function verifySignatures(pdfBytes) {
  try {
    const { PDFDocument } = require('pdf-lib')
    const { findSignatureDicts } = await import('../src/lib/pdfSignatureFields.js')
    const { byteRangeCoverage } = await import('../src/lib/signatureVerifyFormat.js')
    const { verifyDetachedSignature } = require('./pkcs7Verify')

    const buf = Buffer.from(pdfBytes)
    const doc = await PDFDocument.load(buf)
    const sigs = findSignatureDicts(doc)

    const signatures = sigs.map((sig) => {
      const [s1, l1, s2, l2] = sig.byteRange
      const signedContent = Buffer.concat([buf.subarray(s1, s1 + l1), buf.subarray(s2, s2 + l2)])
      const verdict = verifyDetachedSignature(Buffer.from(sig.contentsBytes), signedContent)
      return { ...sig, ...verdict, coverage: byteRangeCoverage(sig.byteRange, buf.length) }
    })
    return { success: true, signatures }
  } catch (e) {
    return { success: false, error: e.message || 'Unbekannter Fehler' }
  }
}

ipcMain.handle('sign:verify', (_, pdfBytes) => verifySignatures(pdfBytes))

// ── PDF/A validation (bundled veraPDF — a real, ISO-accredited conformance
// checker) ───────────────────────────────────────────────────────────────
// Not embedded/linked into our own code: we shell out to it as a separate
// Java process, the same way an app might shell out to ffmpeg. Bundled via
// `npm run setup:verapdf` into vendor/verapdf-runtime/ (gitignored, populated
// at build time) — see scripts/setup-verapdf.js for the licensing rationale
// (MPLv2+, one of veraPDF's two license options).
function getVerapdfRuntime() {
  const base = isDev
    ? path.join(__dirname, '..', 'vendor', 'verapdf-runtime')
    : path.join(process.resourcesPath, 'verapdf-runtime')
  return {
    javaExe:    path.join(base, 'jre', 'bin', 'java.exe'),
    verapdfDir: path.join(base, 'verapdf'),
  }
}

ipcMain.handle('pdfa:validate', async (_, pdfBytes) => {
  const { javaExe, verapdfDir } = getVerapdfRuntime()
  if (!fs.existsSync(javaExe) || !fs.existsSync(verapdfDir)) {
    return { available: false }
  }

  const tmpFile = path.join(app.getPath('temp'), `clover-pdfa-check-${crypto.randomUUID()}.pdf`)
  fs.writeFileSync(tmpFile, Buffer.from(pdfBytes))
  try {
    const classpath = `${path.join(verapdfDir, 'etc')};${path.join(verapdfDir, 'bin', '*')}`
    const args = [
      '-classpath', classpath,
      `-Dapp.home=${verapdfDir}`,
      '--add-exports=java.base/sun.security.pkcs=ALL-UNNAMED',
      'org.verapdf.apps.GreenfieldCliWrapper',
      '-f', '1b', '--format', 'json',
      tmpFile,
    ]
    // veraPDF exits non-zero whenever the file is non-compliant (that's a
    // normal validation result, not a crash) — so stdout is parsed regardless
    // of exit code, and only a JSON-parse failure counts as a real error.
    const stdout = await new Promise((resolve, reject) => {
      execFile(javaExe, args, { maxBuffer: 20 * 1024 * 1024 }, (_err, stdout, stderr) => {
        if (!stdout) reject(new Error(stderr || 'Keine Ausgabe von veraPDF'))
        else resolve(stdout)
      })
    })
    const parsed = JSON.parse(stdout)
    const result = parsed?.report?.jobs?.[0]?.validationResult?.[0]
    if (!result) return { available: true, success: false, error: 'Kein Prüfergebnis von veraPDF erhalten.' }
    return {
      available: true,
      success: true,
      compliant: result.compliant,
      profileName: result.profileName,
      passedRules: result.details.passedRules,
      failedRules: result.details.failedRules,
      failures: (result.details.ruleSummaries || [])
        .filter(r => r.ruleStatus === 'FAILED')
        .map(r => ({
          clause: r.clause,
          description: r.description,
          errorMessage: r.checks?.[0]?.errorMessage || '',
        })),
    }
  } catch (e) {
    return { available: true, success: false, error: e.message || 'Unbekannter Fehler bei der veraPDF-Prüfung' }
  } finally {
    fs.unlink(tmpFile, () => {})
  }
})

// ── PDF encryption (bundled qpdf) ───────────────────────────────────────────
// pdf-lib has no encryption support, so — same pattern as veraPDF above —
// this shells out to the qpdf CLI as a separate process. Bundled via
// `npm run setup:qpdf` into vendor/qpdf-runtime/ (gitignored, populated at
// build time), see scripts/setup-qpdf.js for the Apache-2.0 licensing note.
function getQpdfExe() {
  const base = isDev
    ? path.join(__dirname, '..', 'vendor', 'qpdf-runtime')
    : path.join(process.resourcesPath, 'qpdf-runtime')
  return path.join(base, 'bin', 'qpdf.exe')
}

ipcMain.handle('pdf:encrypt', async (_, pdfBytes, opts) => {
  const qpdfExe = getQpdfExe()
  if (!fs.existsSync(qpdfExe)) return { available: false }

  const tmpIn  = path.join(app.getPath('temp'), `clover-encrypt-in-${crypto.randomUUID()}.pdf`)
  const tmpOut = path.join(app.getPath('temp'), `clover-encrypt-out-${crypto.randomUUID()}.pdf`)
  fs.writeFileSync(tmpIn, Buffer.from(pdfBytes))
  try {
    const { userPassword = '', ownerPassword = '', allowPrint = true, allowCopy = true, allowModify = true } = opts || {}
    const args = [
      '--encrypt', userPassword, ownerPassword || userPassword, '256',
      `--print=${allowPrint ? 'full' : 'none'}`,
      `--extract=${allowCopy ? 'y' : 'n'}`,
      `--modify=${allowModify ? 'all' : 'none'}`,
      '--',
      tmpIn, tmpOut,
    ]
    await new Promise((resolve, reject) => {
      execFile(qpdfExe, args, (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      })
    })
    const bytes = fs.readFileSync(tmpOut)
    return { available: true, success: true, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  } catch (e) {
    return { available: true, success: false, error: e.message || 'Unbekannter Fehler bei der Verschlüsselung' }
  } finally {
    fs.unlink(tmpIn, () => {})
    fs.unlink(tmpOut, () => {})
  }
})

// PDF reparieren: qpdf ohne besondere Flags liest und schreibt die Datei neu,
// was die Xref-Tabelle normalisiert und viele Beschädigungsklassen (defekte
// Xref, abgebrochene Linearisierung, verkürzte startxref) als Nebeneffekt
// behebt. Kein eigenes "--check" vorab nötig - execFile schlägt bei einer
// tatsächlich nicht reparierbaren Datei bereits selbst mit stderr fehl.
ipcMain.handle('pdf:repair', async (_, pdfBytes) => {
  const qpdfExe = getQpdfExe()
  if (!fs.existsSync(qpdfExe)) return { available: false }

  const tmpIn  = path.join(app.getPath('temp'), `clover-repair-in-${crypto.randomUUID()}.pdf`)
  const tmpOut = path.join(app.getPath('temp'), `clover-repair-out-${crypto.randomUUID()}.pdf`)
  fs.writeFileSync(tmpIn, Buffer.from(pdfBytes))
  try {
    await new Promise((resolve, reject) => {
      execFile(qpdfExe, [tmpIn, tmpOut], (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      })
    })
    const bytes = fs.readFileSync(tmpOut)
    return { available: true, success: true, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  } catch (e) {
    return { available: true, success: false, error: e.message || 'Unbekannter Fehler bei der Reparatur' }
  } finally {
    fs.unlink(tmpIn, () => {})
    fs.unlink(tmpOut, () => {})
  }
})

// ── Persistent storage ─────────────────────────────────────────────────────
const recentPath   = path.join(app.getPath('userData'), 'recent.json')
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

ipcMain.handle('recent:load',    ()       => { try { return JSON.parse(fs.readFileSync(recentPath,   'utf8')) } catch { return [] } })
ipcMain.handle('recent:save',    (_, l)   => { fs.writeFileSync(recentPath,   JSON.stringify(l)) })
ipcMain.handle('settings:load',  ()       => { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} } })
ipcMain.handle('settings:save',  (_, d)   => {
  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch {}
  fs.writeFileSync(settingsPath, JSON.stringify({ ...existing, ...d }))
})

// ── Directory picker (for image export, batch processing) ─────────────────
ipcMain.handle('dialog:saveDirectory', () => dialog.showOpenDialog(mainWindow, {
  title: 'Ausgabeordner wählen',
  properties: ['openDirectory', 'createDirectory'],
}))

// ── Document library: recursive scan of watched folders for PDFs ──────────
// scanFolder() is capped at LIBRARY_SCAN_LIMIT files / LIBRARY_SCAN_DEPTH
// directory levels (see mainUtils.js) so a folder pointed at something huge
// (e.g. a whole user profile) can't hang the app.
ipcMain.handle('library:scan', (_, folders) => {
  const results = []
  for (const folder of folders || []) {
    if (results.length >= LIBRARY_SCAN_LIMIT) break
    scanFolder(folder, results)
  }
  return results
})

// Auto-detects common local cloud-sync folders (OneDrive/Google Drive/Dropbox)
// so the user can add them to the library with one click instead of hunting
// through a folder picker. Purely local-folder detection - no cloud API/OAuth.
ipcMain.handle('library:detectCloudFolders', () => {
  const home = os.homedir()
  const candidates = []

  // OneDrive: personal is just "OneDrive"; business/school tenants are named
  // "OneDrive - <Organization>" and vary per install, so scan for the prefix
  // rather than guessing an exact name.
  try {
    for (const entry of fs.readdirSync(home)) {
      if (entry.startsWith('OneDrive')) candidates.push({ label: entry, path: path.join(home, entry) })
    }
  } catch {}

  candidates.push({ label: 'Google Drive', path: path.join(home, 'Google Drive') })
  candidates.push({ label: 'Dropbox', path: path.join(home, 'Dropbox') })

  // Dropbox can be configured to sync to a custom location - if so, the real
  // path is recorded in this per-user info file rather than the default above.
  try {
    const infoPath = path.join(process.env.LOCALAPPDATA || '', 'Dropbox', 'info.json')
    if (fs.existsSync(infoPath)) {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'))
      for (const key of Object.keys(info)) {
        if (info[key]?.path) candidates.push({ label: `Dropbox (${key})`, path: info[key].path })
      }
    }
  } catch {}

  const seen = new Set()
  return candidates.filter(c => {
    const key = path.resolve(c.path)
    if (seen.has(key) || !fs.existsSync(c.path)) return false
    seen.add(key)
    return true
  })
})

// ── Default app ────────────────────────────────────────────────────────────
// Opens Windows "Default Apps" settings so the user can set CloverleafPDF as the default PDF viewer.
// The deeper URI (defaultapps-fileexplorer) goes straight to file-type associations on Win11.
ipcMain.handle('app:setAsDefault', () => {
  shell.openExternal('ms-settings:defaultapps-fileexplorer?Type=.pdf').catch(() => {
    shell.openExternal('ms-settings:defaultapps')
  })
})
