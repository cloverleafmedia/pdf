const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

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
ipcMain.handle('win:print',           () => mainWindow.webContents.print({ silent: false, printBackground: true }))
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

// ── File I/O ───────────────────────────────────────────────────────────────
// Extension allowlist: renderer-controlled paths must not be able to read/write
// arbitrary files on disk (defense in depth in case of a future renderer compromise).
const READABLE_EXTENSIONS = new Set(['.pdf'])
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

// ── Persistent storage ─────────────────────────────────────────────────────
const recentPath   = path.join(app.getPath('userData'), 'recent.json')
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

ipcMain.handle('recent:load',    ()       => { try { return JSON.parse(fs.readFileSync(recentPath,   'utf8')) } catch { return [] } })
ipcMain.handle('recent:save',    (_, l)   => { fs.writeFileSync(recentPath,   JSON.stringify(l)) })
ipcMain.handle('settings:load',  ()       => { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} } })
ipcMain.handle('settings:save',  (_, d)   => { fs.writeFileSync(settingsPath, JSON.stringify(d)) })

// ── Directory picker (for image export, batch processing) ─────────────────
ipcMain.handle('dialog:saveDirectory', () => dialog.showOpenDialog(mainWindow, {
  title: 'Ausgabeordner wählen',
  properties: ['openDirectory', 'createDirectory'],
}))

// ── Default app ────────────────────────────────────────────────────────────
// Opens Windows "Default Apps" settings so the user can set CloverleafPDF as the default PDF viewer.
// The deeper URI (defaultapps-fileexplorer) goes straight to file-type associations on Win11.
ipcMain.handle('app:setAsDefault', () => {
  shell.openExternal('ms-settings:defaultapps-fileexplorer?Type=.pdf').catch(() => {
    shell.openExternal('ms-settings:defaultapps')
  })
})
