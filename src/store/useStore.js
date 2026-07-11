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
  textFontSize:       12,
  textBold:           false,

  // ── Annotations ─────────────────────────────────────────────────────────
  annotations:        [],
  annotationHistory:  [],
  annotationFuture:   [],
  // Currently marked note/text/stamp annotations (hand tool) - a flat array
  // of ids, deliberately not scoped per-page since all pages are mounted at
  // once and a shift-click selection can span pages. Group-drag/align/delete
  // consumers restrict themselves to same-page subsets where that matters.
  selectedAnnotationIds: [],

  // ── Redactions (pending, not yet applied) ───────────────────────────────
  pendingRedactions: [],

  // ── Form fields (AcroForm values, keyed by field name) ──────────────────
  formValues: {},

  // ── New form-field drafts (pending, not yet baked in on save) ───────────
  pendingFormFields: [],
  newFieldType: 'text', // 'text' | 'checkbox' - which type the next drag-to-place placement creates

  // ── Shape annotations (rectangle / circle / arrow) ──────────────────────
  shapeType: 'rectangle', // 'rectangle' | 'circle' | 'arrow' - which shape the 'shape' tool draws next

  // ── Stamp tool - StampModal arms this, a single click on the page places it ──
  pendingStampConfig: null, // { kind: 'approved'|'draft'|'confidential'|'custom', text?, color?, imageBytes?, imageExt?, imageUrl?, aspect? }

  // ── Radio-Button-Gruppe: which group the next placed 'radio' draft joins ──
  // (null = the next placement mints a fresh group and becomes its first option)
  activeRadioGroupId: null,

  // ── Reusable templates (Wasserzeichen / Kopf-Fußzeile) ──────────────────
  watermarkTemplates:    [],
  headerFooterTemplates: [],
  stampTemplates:        [],

  // ── UI state ────────────────────────────────────────────────────────────
  sidebarOpen:  true,
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
  theme:       'dark',        // resolved dark/light value every component actually reads
  themeMode:   'dark',        // user preference: 'dark' | 'light' | 'system' - default matches prior behavior
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
  printDialogOpen:  false,
  sanitizeOpen:     false,
  mailMergeOpen:    false,
  pdfaOpen:         false,
  a11yOpen:         false,
  libraryOpen:      false,
  encryptOpen:      false,
  imagesToPdfOpen:  false,
  altTextOpen:      false,
  signatureVerifyOpen: false,
  hasSignatures:       false,
  hasJavaScriptActions: false,
  tableExtractOpen:    false,
  commentsSummaryOpen: false,
  stampOpen:           false,
  applyStampOpen:      false,
  applyStampSourceId:  null, // annotation id of the stamp being replicated across pages
  attachmentsOpen:     false,

  // ── Document library (folders watched for PDFs, tags per file path) ──────
  libraryFolders: [],
  libraryTags:    {},

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
    selectedAnnotationIds: [],
    pendingRedactions: [],
    pendingFormFields: [],
    formValues: {},
    pageRotations: {},
    isDirty: false,
    zoom: s.defaultZoom,
    activeTabId: s.activeTabId || ('tab-' + Date.now()),
  })),

  closeDocument: () => set({
    pdfDoc: null, pdfBytes: null, filePath: null, fileName: null, fileSize: 0,
    currentPage: 1, totalPages: 0, annotations: [], selectedAnnotationIds: [], pendingRedactions: [], pendingFormFields: [], formValues: {}, pageRotations: {}, isDirty: false,
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
    // Annotation selection (drag/resize/rotate/align) only makes sense under
    // the hand tool - switching away from it would otherwise leave a stale
    // selection that no longer has any visible affordance to act on it.
    selectedAnnotationIds: t === 'hand' ? s.selectedAnnotationIds : [],
  })),
  setDrawColor:  (c) => set({ drawColor: c }),
  setDrawWidth:  (w) => set({ drawWidth: w }),
  setTextFontSize: (s) => set({ textFontSize: s }),
  setTextBold: (b) => set({ textBold: b }),
  setPendingStampConfig: (cfg) => set({ pendingStampConfig: cfg }),
  setActiveRadioGroupId: (id) => set({ activeRadioGroupId: id }),
  setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),

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
  // Batch counterpart of addAnnotation - one history push for the whole
  // list (e.g. "apply stamp to 50 pages"), so a single Ctrl+Z undoes the
  // entire batch instead of one page at a time.
  addAnnotations: (list) => {
    const prev = get().annotations
    const copies = list.map(a => ({ ...a, id: Date.now() + Math.random() }))
    set({
      annotations: [...prev, ...copies],
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      isDirty: true,
    })
  },
  updateAnnotation: (id, updates) => set(s => ({
    annotations: s.annotations.map(a => a.id === id ? { ...a, ...updates } : a),
    isDirty: true,
  })),
  // Batch counterpart of updateAnnotation - one history push for the whole
  // set of updates (e.g. an "Align Left" click moving several annotations
  // at once), unlike updateAnnotation itself which stays history-less since
  // it's also used for continuous drag/resize (see the annotDrag/annotResize
  // effects in PDFViewer.jsx), where every intermediate tick must NOT be its
  // own undo step.
  updateAnnotationsBatch: (updates) => {
    const prev = get().annotations
    const byId = new Map(updates.map(u => [u.id, u]))
    set({
      annotations: prev.map(a => byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a),
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      isDirty: true,
    })
  },

  removeAnnotation: (id) => {
    const prev = get().annotations
    set({
      annotations: prev.filter(a => a.id !== id),
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      isDirty: true,
    })
  },

  // Plural counterparts for the selection-driven keyboard/toolbar actions
  // (Entf/Strg+D, and the SelectionToolbar's own buttons) - handle 1..N ids
  // uniformly in a single undo step, unlike removeAnnotation/addAnnotation
  // above which stay untouched for the existing single-item call sites
  // (right-click delete, StampModal placement, etc).
  removeAnnotations: (ids) => {
    const prev = get().annotations
    set({
      annotations: prev.filter(a => !ids.includes(a.id)),
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      selectedAnnotationIds: [],
      isDirty: true,
    })
  },
  duplicateAnnotations: (ids) => {
    const prev = get().annotations
    const DUPLICATE_OFFSET = 16
    const copies = prev.filter(a => ids.includes(a.id))
      .map(a => ({ ...a, id: Date.now() + Math.random(), x: a.x + DUPLICATE_OFFSET, y: a.y + DUPLICATE_OFFSET }))
    if (!copies.length) return
    set({
      annotations: [...prev, ...copies],
      annotationHistory: [...get().annotationHistory.slice(-29), prev],
      annotationFuture: [],
      // The new copies become the selection, ready to be dragged into place.
      selectedAnnotationIds: copies.map(c => c.id),
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
    const { annotationHistory, annotations, annotationFuture, selectedAnnotationIds } = get()
    if (!annotationHistory.length) return
    const prev = annotationHistory[annotationHistory.length - 1]
    set({
      annotations: prev,
      annotationHistory: annotationHistory.slice(0, -1),
      annotationFuture: [annotations, ...annotationFuture.slice(0, 29)],
      // Prune ids that no longer exist in the restored snapshot (e.g.
      // undoing a delete-selection) so no UI keeps referencing ghost ids.
      selectedAnnotationIds: selectedAnnotationIds.filter(id => prev.some(a => a.id === id)),
      isDirty: true,
    })
  },
  redoAnnotation: () => {
    const { annotationFuture, annotations, annotationHistory, selectedAnnotationIds } = get()
    if (!annotationFuture.length) return
    const next = annotationFuture[0]
    set({
      annotations: next,
      selectedAnnotationIds: selectedAnnotationIds.filter(id => next.some(a => a.id === id)),
      annotationHistory: [...annotationHistory.slice(-29), annotations],
      annotationFuture: annotationFuture.slice(1),
      isDirty: true,
    })
  },

  // ── Actions: redactions ─────────────────────────────────────────────────
  // Date.now() + Math.random() (same pattern as addAnnotation above) rather
  // than Date.now() alone - multiple matches from search/auto-PII-detect are
  // added synchronously in a forEach loop and would otherwise collide on the
  // same millisecond, giving several redactions an identical id (React
  // duplicate-key warning, and removeRedaction(id) would remove all of them
  // at once instead of just one).
  addRedaction:    (r) => set(s => ({ pendingRedactions: [...s.pendingRedactions, { ...r, id: Date.now() + Math.random() }] })),
  removeRedaction: (id) => set(s => ({ pendingRedactions: s.pendingRedactions.filter(r => r.id !== id) })),
  clearRedactions: ()  => set({ pendingRedactions: [] }),
  removeRedactionsBySource: (source) => set(s => ({ pendingRedactions: s.pendingRedactions.filter(r => r.source !== source) })),

  addFormFieldDraft:    (f) => set(s => ({ pendingFormFields: [...s.pendingFormFields, { ...f, id: Date.now() }] })),
  updateFormFieldDraft: (id, updates) => set(s => ({
    pendingFormFields: s.pendingFormFields.map(f => f.id === id ? { ...f, ...updates } : f),
  })),
  removeFormFieldDraft: (id) => set(s => ({ pendingFormFields: s.pendingFormFields.filter(f => f.id !== id) })),
  clearFormFieldDrafts: ()  => set({ pendingFormFields: [], activeRadioGroupId: null }),
  setNewFieldType:      (t) => set(s => ({ newFieldType: t, activeRadioGroupId: t === 'radio' ? s.activeRadioGroupId : null })),
  setShapeType:         (t) => set({ shapeType: t }),

  // ── Actions: form fields ────────────────────────────────────────────────
  setFormValue: (key, value) => set(s => ({ formValues: { ...s.formValues, [key]: value }, isDirty: true })),
  // Fills in a field's own pre-existing value from the PDF (read-only display
  // purposes) without marking the document dirty - unlike setFormValue, this
  // isn't a user edit. Never overwrites a key that's already present, so it
  // can't clobber a value the user has already typed/changed.
  seedFormValues: (entries) => set(s => {
    const next = { ...s.formValues }
    let changed = false
    for (const [key, value] of Object.entries(entries)) {
      if (!(key in next)) { next[key] = value; changed = true }
    }
    return changed ? { formValues: next } : {}
  }),

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
  saveStampTemplate: (name, config) => {
    const next = [...get().stampTemplates, { id: Date.now(), name, config }]
    set({ stampTemplates: next })
    window.api?.saveSettings({ stampTemplates: next })
  },
  deleteStampTemplate: (id) => {
    const next = get().stampTemplates.filter(t => t.id !== id)
    set({ stampTemplates: next })
    window.api?.saveSettings({ stampTemplates: next })
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
  // Persists the user's mode preference only ('dark' | 'light' | 'system').
  // Does NOT resolve/apply 'system' itself - the caller must also call
  // setTheme(isDark ? 'dark' : 'light') right after with a value obtained via
  // window.api.getSystemTheme(), since resolving 'system' needs an async IPC
  // round-trip this action can't perform on its own.
  setThemeMode: (mode) => {
    set({ themeMode: mode })
    window.api?.saveSettings({ themeMode: mode })
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
  closeCompare:       () => set({ compareOpen: false, compareDoc: null }),
  setCompareDoc:      (doc) => set({ compareDoc: doc }),
  openPrintDialog:    () => set({ printDialogOpen: true }),
  closePrintDialog:   () => set({ printDialogOpen: false }),
  openSanitize:       () => set({ sanitizeOpen: true }),
  closeSanitize:      () => set({ sanitizeOpen: false }),
  openMailMerge:      () => set({ mailMergeOpen: true }),
  closeMailMerge:     () => set({ mailMergeOpen: false }),
  openPdfa:           () => set({ pdfaOpen: true }),
  closePdfa:          () => set({ pdfaOpen: false }),
  openA11y:           () => set({ a11yOpen: true }),
  closeA11y:          () => set({ a11yOpen: false }),
  openLibrary:        () => set({ libraryOpen: true }),
  closeLibrary:       () => set({ libraryOpen: false }),
  openEncrypt:        () => set({ encryptOpen: true }),
  closeEncrypt:       () => set({ encryptOpen: false }),
  openImagesToPdf:    () => set({ imagesToPdfOpen: true }),
  closeImagesToPdf:   () => set({ imagesToPdfOpen: false }),
  openAltText:        () => set({ altTextOpen: true }),
  closeAltText:       () => set({ altTextOpen: false }),
  openSignatureVerify:  () => set({ signatureVerifyOpen: true }),
  closeSignatureVerify: () => set({ signatureVerifyOpen: false }),
  setHasSignatures:     (v) => set({ hasSignatures: v }),
  setHasJavaScriptActions: (v) => set({ hasJavaScriptActions: v }),
  openTableExtract:     () => set({ tableExtractOpen: true }),
  closeTableExtract:    () => set({ tableExtractOpen: false }),
  openCommentsSummary:  () => set({ commentsSummaryOpen: true }),
  closeCommentsSummary: () => set({ commentsSummaryOpen: false }),
  openStamp:            () => set({ stampOpen: true }),
  closeStamp:           () => set({ stampOpen: false }),
  openApplyStamp:       (id) => set({ applyStampOpen: true, applyStampSourceId: id }),
  closeApplyStamp:      () => set({ applyStampOpen: false, applyStampSourceId: null }),
  openAttachments:      () => set({ attachmentsOpen: true }),
  closeAttachments:     () => set({ attachmentsOpen: false }),

  // ── Actions: document library ───────────────────────────────────────────
  setLibraryFolders: (folders) => {
    set({ libraryFolders: folders })
    window.api?.saveSettings({ libraryFolders: folders })
  },
  addLibraryFolder: (folder) => {
    const next = [...new Set([...get().libraryFolders, folder])]
    set({ libraryFolders: next })
    window.api?.saveSettings({ libraryFolders: next })
  },
  removeLibraryFolder: (folder) => {
    const next = get().libraryFolders.filter(f => f !== folder)
    set({ libraryFolders: next })
    window.api?.saveSettings({ libraryFolders: next })
  },
  setLibraryTags: (path, tags) => {
    const next = { ...get().libraryTags, [path]: tags }
    set({ libraryTags: next })
    window.api?.saveSettings({ libraryTags: next })
  },

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
      formValues: s.formValues, pendingFormFields: s.pendingFormFields,
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
      annotations: [], annotationHistory: [], annotationFuture: [], selectedAnnotationIds: [],
      pendingRedactions: [], pendingFormFields: [], formValues: {}, pageRotations: {}, isDirty: false,
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
      annotationFuture: target.annotationFuture, selectedAnnotationIds: [], pendingRedactions: target.pendingRedactions,
      formValues: target.formValues || {}, pendingFormFields: target.pendingFormFields || [],
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
          annotationFuture: prev.annotationFuture, selectedAnnotationIds: [], pendingRedactions: prev.pendingRedactions,
          formValues: prev.formValues || {}, pendingFormFields: prev.pendingFormFields || [],
          pageRotations: prev.pageRotations, zoom: prev.zoom,
        })
      } else {
        set({
          tabs: [], activeTabId: null,
          pdfDoc: null, pdfBytes: null, filePath: null, fileName: null, fileSize: 0,
          currentPage: 1, totalPages: 0, annotations: [], selectedAnnotationIds: [], pendingRedactions: [], pendingFormFields: [], formValues: {}, pageRotations: {}, isDirty: false,
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
