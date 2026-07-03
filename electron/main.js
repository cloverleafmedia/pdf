const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const { execFile } = require('child_process')

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
    const file = getInitialFile(argv)
    if (file) mainWindow.webContents.send('open-file', file)
  }
})

function getInitialFile(argv = process.argv) {
  // In production: argv = [exe, file?]; in dev: argv = [electron, main.js, file?]
  const args = argv.slice(isDev ? 2 : 1)
  return args.find(a => !a.startsWith('-') && a.toLowerCase().endsWith('.pdf') && fs.existsSync(a)) || null
}

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
      webSecurity:      !isDev,
    },
  })

  mainWindow.on('maximize',    () => mainWindow.webContents.send('window-state-change', true))
  mainWindow.on('unmaximize',  () => mainWindow.webContents.send('window-state-change', false))
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-change', true))
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-change', false))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Send initial file (opened via double-click / "Open with") once the renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    const file = getInitialFile()
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

ipcMain.handle('dialog:pickFolder', (_, title) => dialog.showOpenDialog(mainWindow, {
  title: title || 'Ordner auswählen',
  properties: ['openDirectory'],
}))

// ── File I/O ───────────────────────────────────────────────────────────────
// Extension allowlist: renderer-controlled paths must not be able to read/write
// arbitrary files on disk (defense in depth in case of a future renderer compromise).
const READABLE_EXTENSIONS = new Set(['.pdf', '.csv'])
const WRITABLE_EXTENSIONS  = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt'])

function assertExtension(filePath, allowed) {
  const ext = path.extname(filePath).toLowerCase()
  if (!allowed.has(ext)) {
    throw new Error(`Dateityp "${ext}" ist für diese Operation nicht erlaubt.`)
  }
}

ipcMain.handle('fs:read', (_, filePath) => {
  assertExtension(filePath, READABLE_EXTENSIONS)
  const data = fs.readFileSync(filePath)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})

ipcMain.handle('fs:write', (_, filePath, data) => {
  assertExtension(filePath, WRITABLE_EXTENSIONS)
  fs.writeFileSync(filePath, Buffer.from(data))
  return true
})

ipcMain.handle('fs:exists', (_, filePath) => fs.existsSync(filePath))

ipcMain.handle('shell:showInFolder', (_, filePath) => shell.showItemInFolder(filePath))

// ── Digital signature (PKCS#12 certificate) ─────────────────────────────────
// Runs entirely in the main process: node-forge/@signpdf are Node-only, and
// keeping the certificate file + its password out of the renderer entirely
// (the renderer only ever sees a file path, chosen via dialog:openCert) is a
// deliberate defense-in-depth choice, same spirit as the fs read/write allowlist.
async function signPdf(pdfBytes, certPath, password, meta) {
  try {
    assertExtension(certPath, new Set(['.p12', '.pfx']))
    const { PDFDocument } = require('pdf-lib')
    const { plainAddPlaceholder } = require('@signpdf/placeholder-plain')
    const signpdf = require('@signpdf/signpdf').default
    const { P12Signer } = require('@signpdf/signer-p12')

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
    })
    const signer = new P12Signer(certBuffer, { passphrase: password || '' })
    const signed = await signpdf.sign(pdfWithPlaceholder, signer)
    return { success: true, bytes: signed.buffer.slice(signed.byteOffset, signed.byteOffset + signed.byteLength) }
  } catch (e) {
    return { success: false, error: e.message || 'Unbekannter Fehler' }
  }
}

ipcMain.handle('sign:pdf', (_, pdfBytes, certPath, password, meta) => signPdf(pdfBytes, certPath, password, meta))

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

  const tmpFile = path.join(app.getPath('temp'), `clover-pdfa-check-${Date.now()}.pdf`)
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
// Capped at LIBRARY_SCAN_LIMIT files / LIBRARY_SCAN_DEPTH directory levels so a
// folder pointed at something huge (e.g. a whole user profile) can't hang the app.
const LIBRARY_SCAN_LIMIT = 2000
const LIBRARY_SCAN_DEPTH = 6

function scanFolder(root, results) {
  const walk = (dir, depth) => {
    if (results.length >= LIBRARY_SCAN_LIMIT || depth > LIBRARY_SCAN_DEPTH) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (results.length >= LIBRARY_SCAN_LIMIT) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        try {
          const stat = fs.statSync(full)
          results.push({ path: full, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs })
        } catch {}
      }
    }
  }
  walk(root, 0)
}

ipcMain.handle('library:scan', (_, folders) => {
  const results = []
  for (const folder of folders || []) {
    if (results.length >= LIBRARY_SCAN_LIMIT) break
    scanFolder(folder, results)
  }
  return results
})

// ── Default app ────────────────────────────────────────────────────────────
// Opens Windows "Default Apps" settings so the user can set CloverleafPDF as the default PDF viewer.
// The deeper URI (defaultapps-fileexplorer) goes straight to file-type associations on Win11.
ipcMain.handle('app:setAsDefault', () => {
  shell.openExternal('ms-settings:defaultapps-fileexplorer?Type=.pdf').catch(() => {
    shell.openExternal('ms-settings:defaultapps')
  })
})
