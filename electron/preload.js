const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize:         () => ipcRenderer.invoke('win:minimize'),
  maximize:         () => ipcRenderer.invoke('win:maximize'),
  close:            () => ipcRenderer.invoke('win:close'),
  isMaximized:      () => ipcRenderer.invoke('win:isMaximized'),
  toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
  print:            (opts) => ipcRenderer.invoke('win:print', opts),
  getPrinters:      () => ipcRenderer.invoke('win:getPrinters'),
  installUpdate:    () => ipcRenderer.invoke('win:installUpdate'),
  onWindowState:    (cb) => ipcRenderer.on('window-state-change', (_, v) => cb(v)),
  onFullscreen:     (cb) => ipcRenderer.on('fullscreen-change',   (_, v) => cb(v)),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  () => cb()),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),

  // Theme
  getSystemTheme:     () => ipcRenderer.invoke('theme:getSystem'),
  onSystemThemeChange: (cb) => ipcRenderer.on('system-theme-changed', (_, isDark) => cb(isDark)),

  // Dialogs
  openPDF: () => ipcRenderer.invoke('dialog:openPDF'),
  savePDF: (n) => ipcRenderer.invoke('dialog:savePDF', n),
  openCert: () => ipcRenderer.invoke('dialog:openCert'),
  openCSV: () => ipcRenderer.invoke('dialog:openCSV'),
  openXFDF: () => ipcRenderer.invoke('dialog:openXFDF'),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  pickFolder: (title) => ipcRenderer.invoke('dialog:pickFolder', title),

  // Digital signature (certificate never leaves the main process)
  signPDF: (pdfBytes, certPath, password, meta) => ipcRenderer.invoke('sign:pdf', pdfBytes, certPath, password, meta),
  verifySignatures: (pdfBytes) => ipcRenderer.invoke('sign:verify', pdfBytes),

  // PDF/A validation (bundled veraPDF)
  validatePdfA: (pdfBytes) => ipcRenderer.invoke('pdfa:validate', pdfBytes),

  // PDF encryption (bundled qpdf)
  encryptPDF: (pdfBytes, opts) => ipcRenderer.invoke('pdf:encrypt', pdfBytes, opts),

  // File I/O
  readFile:     (p)    => ipcRenderer.invoke('fs:read', p),
  writeFile:    (p, d) => ipcRenderer.invoke('fs:write', p, d),
  fileExists:   (p)    => ipcRenderer.invoke('fs:exists', p),
  showInFolder: (p)    => ipcRenderer.invoke('shell:showInFolder', p),

  // Persistence
  loadRecent:    () => ipcRenderer.invoke('recent:load'),
  saveRecent:    (l) => ipcRenderer.invoke('recent:save', l),
  loadSettings:  () => ipcRenderer.invoke('settings:load'),
  saveSettings:  (d) => ipcRenderer.invoke('settings:save', d),

  // Default app
  setAsDefault:     () => ipcRenderer.invoke('app:setAsDefault'),
  onOpenFile:       (cb) => ipcRenderer.on('open-file', (_, filePath) => cb(filePath)),

  // Directory picker
  saveDirectory:    () => ipcRenderer.invoke('dialog:saveDirectory'),

  // Document library
  libraryScan:      (folders) => ipcRenderer.invoke('library:scan', folders),
  detectCloudFolders: () => ipcRenderer.invoke('library:detectCloudFolders'),
})
