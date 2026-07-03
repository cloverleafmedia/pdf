import { create } from 'zustand'
import i18n from '../i18n/index.js'

const ANNOTATE_TOOL_IDS = ['highlight', 'underline', 'strikethrough', 'note', 'text', 'draw', 'eraser']

export const useStore = create((set, get) => ({
  // ── PDF document ────────────────────────────────────────────────────────
  pdfDoc:    null,
  pdfBytes:  null,
  filePath:  null,
  fileName:  null,
  fileSize:  0,
  isDirty:   false,

  // ── Navigation ──────────────────────────────────────────────────────────
  currentPage: 1,
  totalPages:  0,

  // ── View ────────────────────────────────────────────────────────────────
  zoom:          100,
  pageRotations: {},

  // ── Tools ───────────────────────────────────────────────────────────────
  activeTool:         'hand',
  lastAnnotateTool:   'highlight',
  drawColor:          '#f59e0b',
  drawWidth:          3,
  annotationOpacity:  0.4,

  // ── Annotations ─────────────────────────────────────────────────────────
  annotations:        [],
  annotationHistory:  [],
  annotationFuture:   [],

  // ── Redactions (pending, not yet applied) ───────────────────────────────
  pendingRedactions: [],

  // ── Form fields (AcroForm values, keyed by field name) ──────────────────
  formValues: {},

  // ── Reusable templates (Wasserzeichen / Kopf-Fußzeile) ──────────────────
  watermarkTemplates:    [],
  headerFooterTemplates: [],

  // ── UI state ────────────────────────────────────────────────────────────
  sidebarOpen:  true,
  sidebarWidth: 264,
  sidebarTab:   'thumbnails',
  statusMessage: '',
  toolbarLabels: false,
  pinnedTools:   [],
  commandPaletteOpen: false,
  shortcutsOpen:      false,

  // ── Search ──────────────────────────────────────────────────────────────
  searchQuery:   '',
  searchResults: [],
  searchIndex:   -1,
  searchCase:    false,

  // ── Recent files ────────────────────────────────────────────────────────
  recentFiles: [],

  // ── Settings ────────────────────────────────────────────────────────────
  theme:       'dark',
  language:    'de',
  defaultZoom: 100,

  // ── View options ─────────────────────────────────────────────────────────
  twoPageView:    false,
  magnifierActive: false,

  // ── Tabs ─────────────────────────────────────────────────────────────────
  // tabs[]: saved state of background tabs. Current doc lives in main state.
  tabs:         [],
  activeTabId:  null,

  // ── Modals ──────────────────────────────────────────────────────────────
  settingsOpen:     false,
  propertiesOpen:   false,
  passwordOpen:     false,
  passwordCb:       null,
  splitOpen:        false,
  ocrOpen:          false,
  nightMode:        false,
  watermarkOpen:    false,
  signatureOpen:    false,
  headerFooterOpen: false,
  presentationMode: false,
  compressOpen:     false,
  exportImagesOpen: false,
  qrCodeOpen:       false,
  cropOpen:         false,
  batchOpen:        false,
  compareOpen:      false,
  compareDoc:       null,
  compareBytes:     null,

  // ── Update notification ──────────────────────────────────────────────────
  updateAvailable:  false,
  updateDownloaded: false,

  // ── Actions: document ───────────────────────────────────────────────────
  openDocument: (pdfDoc, pdfBytes, filePath, fileName, fileSize) => set(s => ({
    pdfDoc, pdfBytes, filePath, fileName, fileSize,
    currentPage: 1,
    totalPages: pdfDoc.numPages,
    annotations: [],
    annotationHistory: [],
    annotationFuture: [],
    pendingRedactions: [],
    formValues: {},
    pageRotations: {},
    isDirty: false,
    zoom: s.defaultZoom,
    activeTabId: s.activeTabId || ('tab-' + Date.now()),
  })),

  closeDocument: () => set({
    pdfDoc: null, pdfBytes: null, filePath: null, fileName: null, fileSize: 0,
    currentPage: 1, totalPages: 0, annotations: [], pendingRedactions: [], formValues: {}, pageRotations: {}, isDirty: false,
  }),

  setPdfBytes:  (b) => set({ pdfBytes: b, isDirty: true }),
  setFilePath:  (p) => set({ filePath: p }),
  setFileName:  (n) => set({ fileName: n }),
  setDirty:     (v) => set({ isDirty: v }),

  // ── Actions: navigation ─────────────────────────────────────────────────
  setCurrentPage: (p) => set(s => ({ currentPage: Math.max(1, Math.min(p, s.totalPages)) })),
  setTotalPages:  (n) => set({ totalPages: n }),

  // ── Actions: view ───────────────────────────────────────────────────────
  setZoom:          (z) => set({ zoom: Math.max(10, Math.min(z, 500)) }),
  zoomIn:           ()  => set(s => ({ zoom: Math.min(s.zoom + 10, 500) })),
  zoomOut:          ()  => set(s => ({ zoom: Math.max(s.zoom - 10, 10) })),
  setTwoPageView:   (v) => set({ twoPageView: v }),
  toggleMagnifier:  ()  => set(s => ({ magnifierActive: !s.magnifierActive })),

  rotatePageLeft:  (page) => set(s => ({
    pageRotations: { ...s.pageRotations, [page]: (((s.pageRotations[page] || 0) - 90) + 360) % 360 }, isDirty: true,
  })),
  rotatePageRight: (page) => set(s => ({
    pageRotations: { ...s.pageRotations, [page]: ((s.pageRotations[page] || 0) + 90) % 360 }, isDirty: true,
  })),

  // ── Actions: tools ──────────────────────────────────────────────────────
  setActiveTool: (t) => set(s => ({
    activeTool: t,
    lastAnnotateTool: ANNOTATE_TOOL_IDS.includes(t) ? t : s.lastAnnotateTool,
  })),
  setDrawColor:  (c) => set({ drawColor: c }),
  setDrawWidth:  (w) => set({ drawWidth: w }),

  // ── Actions: annotations ────────────────────────────────────────────────
  addAnnotation: (a) => {
    const prev = get().annotations
    set({
      annotations: [...prev, { ...a, id: Date.now() + Math.random() }],
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      isDirty: true,
    })
  },
  updateAnnotation: (id, updates) => set(s => ({
    annotations: s.annotations.map(a => a.id === id ? { ...a, ...updates } : a),
    isDirty: true,
  })),

  removeAnnotation: (id) => {
    const prev = get().annotations
    set({
      annotations: prev.filter(a => a.id !== id),
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      isDirty: true,
    })
  },

  // Reply threads on annotations — discussion metadata, not a visual mark, so
  // deliberately kept out of the undo/redo stack.
  addReply: (annotationId, text) => set(s => ({
    annotations: s.annotations.map(a => a.id === annotationId
      ? { ...a, replies: [...(a.replies || []), { id: Date.now() + Math.random(), text, time: Date.now() }] }
      : a),
    isDirty: true,
  })),
  deleteReply: (annotationId, replyId) => set(s => ({
    annotations: s.annotations.map(a => a.id === annotationId
      ? { ...a, replies: (a.replies || []).filter(r => r.id !== replyId) }
      : a),
    isDirty: true,
  })),
  undoAnnotation: () => {
    const { annotationHistory, annotations, annotationFuture } = get()
    if (!annotationHistory.length) return
    const prev = annotationHistory[annotationHistory.length - 1]
    set({
      annotations: prev,
      annotationHistory: annotationHistory.slice(0, -1),
      annotationFuture: [annotations, ...annotationFuture.slice(0, 29)],
      isDirty: true,
    })
  },
  redoAnnotation: () => {
    const { annotationFuture, annotations, annotationHistory } = get()
    if (!annotationFuture.length) return
    const next = annotationFuture[0]
    set({
      annotations: next,
      annotationHistory: [...annotationHistory.slice(-29), annotations],
      annotationFuture: annotationFuture.slice(1),
      isDirty: true,
    })
  },

  // ── Actions: redactions ─────────────────────────────────────────────────
  addRedaction:    (r) => set(s => ({ pendingRedactions: [...s.pendingRedactions, { ...r, id: Date.now() }] })),
  removeRedaction: (id) => set(s => ({ pendingRedactions: s.pendingRedactions.filter(r => r.id !== id) })),
  clearRedactions: ()  => set({ pendingRedactions: [] }),

  // ── Actions: form fields ────────────────────────────────────────────────
  setFormValue: (key, value) => set(s => ({ formValues: { ...s.formValues, [key]: value }, isDirty: true })),

  // ── Actions: sidebar ────────────────────────────────────────────────────
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setSidebarTab:  (t) => set({ sidebarTab: t, sidebarOpen: true }),
  toggleSidebar:  ()  => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  // ── Actions: toolbar ────────────────────────────────────────────────────
  setToolbarLabels: (v) => {
    set({ toolbarLabels: v })
    window.api?.saveSettings({ toolbarLabels: v })
  },
  togglePinnedTool: (id) => {
    const next = get().pinnedTools.includes(id)
      ? get().pinnedTools.filter(p => p !== id)
      : [...get().pinnedTools, id]
    set({ pinnedTools: next })
    window.api?.saveSettings({ pinnedTools: next })
  },

  // ── Actions: reusable templates ─────────────────────────────────────────
  saveWatermarkTemplate: (name, config) => {
    const next = [...get().watermarkTemplates, { id: Date.now(), name, config }]
    set({ watermarkTemplates: next })
    window.api?.saveSettings({ watermarkTemplates: next })
  },
  deleteWatermarkTemplate: (id) => {
    const next = get().watermarkTemplates.filter(t => t.id !== id)
    set({ watermarkTemplates: next })
    window.api?.saveSettings({ watermarkTemplates: next })
  },
  saveHeaderFooterTemplate: (name, config) => {
    const next = [...get().headerFooterTemplates, { id: Date.now(), name, config }]
    set({ headerFooterTemplates: next })
    window.api?.saveSettings({ headerFooterTemplates: next })
  },
  deleteHeaderFooterTemplate: (id) => {
    const next = get().headerFooterTemplates.filter(t => t.id !== id)
    set({ headerFooterTemplates: next })
    window.api?.saveSettings({ headerFooterTemplates: next })
  },

  // ── Actions: command palette / shortcuts ────────────────────────────────
  openCommandPalette:   () => set({ commandPaletteOpen: true }),
  closeCommandPalette:  () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set(s => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  openShortcuts:  () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),

  // ── Actions: search ─────────────────────────────────────────────────────
  setSearchQuery:   (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r, searchIndex: r.length > 0 ? 0 : -1 }),
  setSearchIndex:   (i) => set({ searchIndex: i }),
  setSearchCase:    (v) => set({ searchCase: v }),

  // ── Actions: recent files ───────────────────────────────────────────────
  setRecentFiles: (l) => set({ recentFiles: l }),
  addRecentFile: (file) => {
    const list = [file, ...get().recentFiles.filter(f => f.path !== file.path)].slice(0, 12)
    set({ recentFiles: list })
    window.api?.saveRecent(list)
  },

  // ── Actions: settings ───────────────────────────────────────────────────
  setTheme: (theme) => {
    set({ theme })
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  },
  setLanguage: (lang) => {
    set({ language: lang })
    i18n.changeLanguage(lang)
  },
  setDefaultZoom: (z) => set({ defaultZoom: z }),

  // ── Actions: modals ─────────────────────────────────────────────────────
  openSettings:    () => set({ settingsOpen: true }),
  closeSettings:   () => set({ settingsOpen: false }),
  openProperties:  () => set({ propertiesOpen: true }),
  closeProperties: () => set({ propertiesOpen: false }),
  openPassword:    (cb) => set({ passwordOpen: true, passwordCb: cb }),
  closePassword:   () => set({ passwordOpen: false, passwordCb: null }),
  openSplit:       () => set({ splitOpen: true }),
  closeSplit:      () => set({ splitOpen: false }),
  openOCR:         () => set({ ocrOpen: true }),
  closeOCR:        () => set({ ocrOpen: false }),
  toggleNightMode:    () => set(s => ({ nightMode: !s.nightMode })),
  openWatermark:      () => set({ watermarkOpen: true }),
  closeWatermark:     () => set({ watermarkOpen: false }),
  openSignature:      () => set({ signatureOpen: true }),
  closeSignature:     () => set({ signatureOpen: false }),
  openHeaderFooter:   () => set({ headerFooterOpen: true }),
  closeHeaderFooter:  () => set({ headerFooterOpen: false }),
  togglePresentation: () => set(s => ({ presentationMode: !s.presentationMode })),
  openCompress:       () => set({ compressOpen: true }),
  closeCompress:      () => set({ compressOpen: false }),
  openExportImages:   () => set({ exportImagesOpen: true }),
  closeExportImages:  () => set({ exportImagesOpen: false }),
  openQRCode:         () => set({ qrCodeOpen: true }),
  closeQRCode:        () => set({ qrCodeOpen: false }),
  openCrop:           () => set({ cropOpen: true }),
  closeCrop:          () => set({ cropOpen: false }),
  openBatch:          () => set({ batchOpen: true }),
  closeBatch:         () => set({ batchOpen: false }),
  openCompare:        () => set({ compareOpen: true }),
  closeCompare:       () => set({ compareOpen: false, compareDoc: null, compareBytes: null }),
  setCompareDoc:      (doc, bytes) => set({ compareDoc: doc, compareBytes: bytes }),

  // ── Actions: tabs ────────────────────────────────────────────────────────
  _snapshotCurrentTab: () => {
    const s = get()
    if (!s.pdfDoc) return null
    return {
      id: s.activeTabId,
      pdfDoc: s.pdfDoc, pdfBytes: s.pdfBytes, filePath: s.filePath,
      fileName: s.fileName, fileSize: s.fileSize, isDirty: s.isDirty,
      currentPage: s.currentPage, totalPages: s.totalPages,
      annotations: s.annotations, annotationHistory: s.annotationHistory,
      annotationFuture: s.annotationFuture, pendingRedactions: s.pendingRedactions,
      formValues: s.formValues,
      pageRotations: s.pageRotations, zoom: s.zoom,
    }
  },
  openTab: (pdfDoc, pdfBytes, filePath, fileName, fileSize) => {
    const snap = get()._snapshotCurrentTab()
    const newId = 'tab-' + Date.now()
    const existingTabs = snap ? [...get().tabs.filter(t => t.id !== get().activeTabId), snap] : get().tabs
    set({
      tabs: existingTabs,
      activeTabId: newId,
      pdfDoc, pdfBytes, filePath, fileName, fileSize,
      currentPage: 1, totalPages: pdfDoc.numPages,
      annotations: [], annotationHistory: [], annotationFuture: [],
      pendingRedactions: [], formValues: {}, pageRotations: {}, isDirty: false,
      zoom: get().defaultZoom,
    })
  },
  switchTab: (id) => {
    const snap = get()._snapshotCurrentTab()
    const target = get().tabs.find(t => t.id === id)
    if (!target) return
    const remaining = get().tabs.filter(t => t.id !== id)
    set({
      tabs: snap ? [...remaining, snap] : remaining,
      activeTabId: id,
      pdfDoc: target.pdfDoc, pdfBytes: target.pdfBytes, filePath: target.filePath,
      fileName: target.fileName, fileSize: target.fileSize, isDirty: target.isDirty,
      currentPage: target.currentPage, totalPages: target.totalPages,
      annotations: target.annotations, annotationHistory: target.annotationHistory,
      annotationFuture: target.annotationFuture, pendingRedactions: target.pendingRedactions,
      formValues: target.formValues || {},
      pageRotations: target.pageRotations, zoom: target.zoom,
    })
  },
  closeTab: (id) => {
    const s = get()
    const isActive = s.activeTabId === id
    const remaining = s.tabs.filter(t => t.id !== id)
    if (isActive) {
      const prev = remaining[remaining.length - 1]
      if (prev) {
        set({
          tabs: remaining.slice(0, -1),
          activeTabId: prev.id,
          pdfDoc: prev.pdfDoc, pdfBytes: prev.pdfBytes, filePath: prev.filePath,
          fileName: prev.fileName, fileSize: prev.fileSize, isDirty: prev.isDirty,
          currentPage: prev.currentPage, totalPages: prev.totalPages,
          annotations: prev.annotations, annotationHistory: prev.annotationHistory,
          annotationFuture: prev.annotationFuture, pendingRedactions: prev.pendingRedactions,
          formValues: prev.formValues || {},
          pageRotations: prev.pageRotations, zoom: prev.zoom,
        })
      } else {
        set({
          tabs: [], activeTabId: null,
          pdfDoc: null, pdfBytes: null, filePath: null, fileName: null, fileSize: 0,
          currentPage: 1, totalPages: 0, annotations: [], pendingRedactions: [], formValues: {}, pageRotations: {}, isDirty: false,
        })
      }
    } else {
      set({ tabs: remaining })
    }
  },

  // ── Actions: updater ────────────────────────────────────────────────────
  setUpdateAvailable:  (v) => set({ updateAvailable: v }),
  setUpdateDownloaded: (v) => set({ updateDownloaded: v }),

  // ── Actions: status ─────────────────────────────────────────────────────
  setStatus: (msg, duration = 3500) => {
    set({ statusMessage: msg })
    if (duration && msg) setTimeout(() => set(s => s.statusMessage === msg ? { statusMessage: '' } : {}), duration)
  },
}))
