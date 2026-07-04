import React, { useEffect, useCallback, useState, Suspense, lazy } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from './store/useStore'
import TitleBar from './components/TitleBar'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import PDFViewer from './components/PDFViewer'
import StatusBar from './components/StatusBar'
import WelcomeScreen from './components/WelcomeScreen'
import TabBar from './components/TabBar'
import CommandPalette from './components/CommandPalette'
import { buildXfdf } from './lib/xfdfExport'
import { parseXfdf } from './lib/xfdfImport'

// Modals/overlays are only ever mounted once their `xOpen` flag is true (see
// the render block below), so lazy-loading them keeps their code out of the
// main bundle chunk until actually needed instead of paying for all ~25 of
// them upfront. CommandPalette renders unconditionally, so it stays a normal
// static import.
const SettingsModal            = lazy(() => import('./components/modals/SettingsModal'))
const PropertiesModal          = lazy(() => import('./components/modals/PropertiesModal'))
const PasswordModal            = lazy(() => import('./components/modals/PasswordModal'))
const SplitModal                = lazy(() => import('./components/modals/SplitModal'))
const OCRModal                  = lazy(() => import('./components/modals/OCRModal'))
const WatermarkModal            = lazy(() => import('./components/modals/WatermarkModal'))
const SignatureModal            = lazy(() => import('./components/modals/SignatureModal'))
const HeaderFooterModal         = lazy(() => import('./components/modals/HeaderFooterModal'))
const CompressModal             = lazy(() => import('./components/modals/CompressModal'))
const ExportImagesModal         = lazy(() => import('./components/modals/ExportImagesModal'))
const QRCodeModal                = lazy(() => import('./components/modals/QRCodeModal'))
const CropModal                  = lazy(() => import('./components/modals/CropModal'))
const BatchModal                 = lazy(() => import('./components/modals/BatchModal'))
const ShortcutsModal             = lazy(() => import('./components/modals/ShortcutsModal'))
const PrintDialog                 = lazy(() => import('./components/modals/PrintDialog'))
const SanitizeModal               = lazy(() => import('./components/modals/SanitizeModal'))
const MailMergeModal              = lazy(() => import('./components/modals/MailMergeModal'))
const PdfaExportModal             = lazy(() => import('./components/modals/PdfaExportModal'))
const AccessibilityCheckModal     = lazy(() => import('./components/modals/AccessibilityCheckModal'))
const LibraryModal                = lazy(() => import('./components/modals/LibraryModal'))
const EncryptModal                = lazy(() => import('./components/modals/EncryptModal'))
const ImagesToPdfModal            = lazy(() => import('./components/modals/ImagesToPdfModal'))
const AltTextModal                = lazy(() => import('./components/modals/AltTextModal'))
const SignatureVerifyModal        = lazy(() => import('./components/modals/SignatureVerifyModal'))
const PresentationMode            = lazy(() => import('./components/PresentationMode'))
const CompareView                 = lazy(() => import('./components/CompareView'))

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

export default function App() {
  const {
    pdfDoc, pdfBytes, theme, sidebarOpen, sidebarWidth,
    settingsOpen, propertiesOpen, passwordOpen, splitOpen, ocrOpen, watermarkOpen, signatureOpen, headerFooterOpen,
    compressOpen, exportImagesOpen, qrCodeOpen, cropOpen, batchOpen, compareOpen, shortcutsOpen, printDialogOpen,
    sanitizeOpen, mailMergeOpen, pdfaOpen, a11yOpen, libraryOpen,
    encryptOpen, imagesToPdfOpen, altTextOpen, signatureVerifyOpen,
    presentationMode,
    updateAvailable, updateDownloaded,
    openDocument, openTab, addRecentFile, setRecentFiles, setTheme, setLanguage, setStatus,
    setUpdateAvailable, setUpdateDownloaded, togglePresentation, setToolbarLabels,
    toggleCommandPalette, openShortcuts, setHasSignatures,
  } = useStore()

  const [isDragging, setIsDragging] = useState(false)

  // ── Boot: load persisted settings & recent files ──────────────────────
  useEffect(() => {
    const boot = async () => {
      const [settings, recent] = await Promise.all([
        window.api?.loadSettings() || {},
        window.api?.loadRecent() || [],
      ])
      setTheme(settings.theme || 'dark')
      const themeMode = settings.themeMode || 'dark'
      useStore.setState({ themeMode })
      if (themeMode === 'system') {
        const isSystemDark = await window.api?.getSystemTheme()
        if (isSystemDark !== undefined) setTheme(isSystemDark ? 'dark' : 'light')
      }
      if (settings.language) setLanguage(settings.language)
      if (settings.toolbarLabels) useStore.setState({ toolbarLabels: true })
      if (Array.isArray(settings.pinnedTools)) useStore.setState({ pinnedTools: settings.pinnedTools })
      if (Array.isArray(settings.watermarkTemplates)) useStore.setState({ watermarkTemplates: settings.watermarkTemplates })
      if (Array.isArray(settings.headerFooterTemplates)) useStore.setState({ headerFooterTemplates: settings.headerFooterTemplates })
      if (Array.isArray(settings.libraryFolders)) useStore.setState({ libraryFolders: settings.libraryFolders })
      if (settings.libraryTags && typeof settings.libraryTags === 'object') useStore.setState({ libraryTags: settings.libraryTags })
      setRecentFiles(recent)
    }
    boot()
  }, [])

  // ── Auto-updater events from main process ────────────────────────────
  useEffect(() => {
    window.api?.onUpdateAvailable?.(() => setUpdateAvailable(true))
    window.api?.onUpdateDownloaded?.(() => setUpdateDownloaded(true))
  }, [])

  // ── Live OS theme changes - only applied while themeMode is 'system' ──
  useEffect(() => {
    window.api?.onSystemThemeChange?.((isDark) => {
      if (useStore.getState().themeMode === 'system') setTheme(isDark ? 'dark' : 'light')
    })
  }, [])

  // ── Load PDF helper ───────────────────────────────────────────────────
  // Pass inTab=true to open in a new tab instead of replacing the current doc
  const loadPDF = useCallback(async (filePath, inTab = false) => {
    try {
      setStatus('Lade …')
      const buf = await window.api?.readFile(filePath)
      if (!buf) return
      const bytes = new Uint8Array(buf)
      const name  = filePath.split(/[\\/]/).pop()

      let doc
      try {
        // pdfjsLib.getDocument() transfers ownership of the buffer to its worker,
        // detaching it — pass a copy so `bytes` stays intact for storing/saving.
        doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
      } catch (err) {
        if (err.name === 'PasswordException') {
          useStore.getState().openPassword(async (pwd) => {
            doc = await pdfjsLib.getDocument({ data: bytes.slice(), password: pwd }).promise
            if (inTab && useStore.getState().pdfDoc) {
              openTab(doc, bytes, filePath, name, bytes.byteLength)
            } else {
              openDocument(doc, bytes, filePath, name, bytes.byteLength)
            }
            addRecentFile({ path: filePath, name, time: Date.now() })
            setStatus('')
          })
          return
        }
        throw err
      }

      if (inTab && useStore.getState().pdfDoc) {
        openTab(doc, bytes, filePath, name, bytes.byteLength)
      } else {
        openDocument(doc, bytes, filePath, name, bytes.byteLength)
      }
      addRecentFile({ path: filePath, name, time: Date.now() })
      setStatus('')
    } catch (e) {
      console.error(e)
      setStatus('Fehler beim Öffnen: ' + (e.message || 'unbekannt'), 5000)
    }
  }, [openDocument, openTab, addRecentFile, setStatus])

  useEffect(() => { window._loadPDF = loadPDF }, [loadPDF])

  // ── Detect embedded signatures (drives the "🔏 Signiert" status-bar badge) ──
  // Keyed on pdfBytes rather than duplicated into every load call site (open,
  // tab, merge, redact-resave, library, drag-drop all update pdfBytes) - pure
  // pdf-lib logic, no forge/crypto needed here, so it's cheap enough to run
  // on every document change.
  useEffect(() => {
    let cancelled = false
    if (!pdfBytes) { setHasSignatures(false); return }
    ;(async () => {
      try {
        const [{ PDFDocument }, { findSignatureDicts }] = await Promise.all([
          import('pdf-lib'),
          import('./lib/pdfSignatureFields'),
        ])
        const doc = await PDFDocument.load(pdfBytes)
        const sigs = findSignatureDicts(doc)
        if (!cancelled) setHasSignatures(sigs.length > 0)
      } catch {
        if (!cancelled) setHasSignatures(false)
      }
    })()
    return () => { cancelled = true }
  }, [pdfBytes, setHasSignatures])

  // ── Open file passed via command-line or second-instance ─────────────
  useEffect(() => {
    window.api?.onOpenFile?.((filePath) => loadPDF(filePath))
  }, [loadPDF])

  // ── Export annotations ───────────────────────────────────────────────
  useEffect(() => {
    window._exportAnnotations = () => {
      const { annotations, fileName } = useStore.getState()
      if (!annotations.length) { useStore.getState().setStatus('Keine Anmerkungen vorhanden'); return }
      const text = annotations.map(a => {
        const lines = [`[Seite ${a.page}] ${a.type.toUpperCase()}`]
        if (a.text) lines.push('  Text: ' + a.text)
        if (a.color) lines.push('  Farbe: ' + a.color)
        return lines.join('\n')
      }).join('\n\n')
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = (fileName || 'anmerkungen').replace('.pdf', '') + '_anmerkungen.txt'
      a.click(); URL.revokeObjectURL(url)
      useStore.getState().setStatus(`${annotations.length} Anmerkung(en) exportiert`)
    }
  }, [])

  // ── Export/import annotations as XFDF (Acrobat-compatible interop) ──────
  const getPageDimensions = async (doc) => {
    const dims = []
    for (let p = 1; p <= doc.numPages; p++) {
      const vp = (await doc.getPage(p)).getViewport({ scale: 1 })
      dims.push({ width: vp.width, height: vp.height })
    }
    return dims
  }

  useEffect(() => {
    window._exportAnnotationsXFDF = async () => {
      const { annotations, fileName, pdfDoc: doc } = useStore.getState()
      if (!annotations.length) { useStore.getState().setStatus('Keine Anmerkungen vorhanden'); return }
      const dims = await getPageDimensions(doc)
      const xml  = buildXfdf(annotations, dims)
      const blob = new Blob([xml], { type: 'application/vnd.adobe.xfdf' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = (fileName || 'anmerkungen').replace('.pdf', '') + '.xfdf'
      a.click(); URL.revokeObjectURL(url)
      useStore.getState().setStatus(`${annotations.length} Anmerkung(en) als XFDF exportiert`)
    }

    window._importAnnotationsXFDF = async () => {
      const { pdfDoc: doc, addAnnotation, setStatus } = useStore.getState()
      if (!doc) return
      const r = await window.api?.openXFDF()
      if (r?.canceled || !r?.filePaths?.[0]) return
      try {
        const buf  = await window.api?.readFile(r.filePaths[0])
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buf))
        const dims = await getPageDimensions(doc)
        const parsed = parseXfdf(text, dims)
        parsed.forEach(a => addAnnotation(a))
        setStatus(`${parsed.length} Anmerkung(en) aus XFDF importiert`)
      } catch (e) {
        setStatus('Fehler beim XFDF-Import: ' + (e.message || 'unbekannt'), 5000)
      }
    }
  }, [])

  // ── Drag & Drop ───────────────────────────────────────────────────────
  useEffect(() => {
    const over   = (e) => { e.preventDefault(); setIsDragging(true) }
    const leave  = ()  => setIsDragging(false)
    const drop   = (e) => {
      e.preventDefault(); setIsDragging(false)
      const f = Array.from(e.dataTransfer.files).find(f => f.name.toLowerCase().endsWith('.pdf'))
      if (f?.path) loadPDF(f.path)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [loadPDF])

  // ── Global keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      if (e.ctrlKey) {
        switch (e.key) {
          case 'o': e.preventDefault(); window.api?.openPDF().then(r => { if (!r?.canceled) loadPDF(r.filePaths[0]) }); break
          case 't': e.preventDefault(); window.api?.openPDF().then(r => { if (!r?.canceled) loadPDF(r.filePaths[0], true) }); break
          case 's': e.preventDefault(); window._savePDF?.(); break
          case 'p': e.preventDefault(); if (s.pdfDoc) s.openPrintDialog(); break
          case '+': case '=': e.preventDefault(); s.zoomIn(); break
          case '-': e.preventDefault(); s.zoomOut(); break
          case '0': e.preventDefault(); s.setZoom(s.defaultZoom); break
          case 'f': e.preventDefault(); s.setSidebarTab('search'); break
          case 'b': e.preventDefault(); s.toggleSidebar(); break
          case 'w': e.preventDefault(); if (s.activeTabId) s.closeTab(s.activeTabId); else s.closeDocument?.(); break
          case 'z': e.preventDefault(); s.undoAnnotation?.(); break
          case 'y': e.preventDefault(); s.redoAnnotation?.(); break
          case 'k': e.preventDefault(); s.toggleCommandPalette?.(); break
          case 'F5': case 'f5': e.preventDefault(); if (s.pdfDoc) s.togglePresentation?.(); break
        }
      } else {
        switch (e.key) {
          case 'ArrowRight': case 'ArrowDown': case 'PageDown': s.setCurrentPage(s.currentPage + 1); break
          case 'ArrowLeft':  case 'ArrowUp':   case 'PageUp':   s.setCurrentPage(s.currentPage - 1); break
          case 'Home': s.setCurrentPage(1); break
          case 'End':  s.setCurrentPage(s.totalPages); break
          case 'F5':   e.preventDefault(); if (s.pdfDoc) s.togglePresentation?.(); break
          case '?':    s.openShortcuts?.(); break
          case 'Escape':
            if (s.commandPaletteOpen) { s.closeCommandPalette?.(); break }
            if (s.presentationMode) { s.togglePresentation?.(); break }
            if (s.activeTool !== 'hand') s.setActiveTool('hand'); break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loadPDF])

  const isDark = theme === 'dark'

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${isDark ? 'bg-zinc-950' : 'bg-gray-100'}`}>

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.07)', border: '3px dashed #10b981' }}>
          <span className="text-clover-400 text-xl font-semibold">PDF hier ablegen</span>
        </div>
      )}

      {/* Update banner */}
      {updateDownloaded && (
        <div className="no-print flex items-center gap-3 px-4 py-2 bg-clover-600 text-white text-sm z-50">
          <span>Update heruntergeladen — jetzt neu starten?</span>
          <button onClick={() => window.api?.installUpdate?.()}
            className="px-3 py-0.5 bg-white text-clover-700 rounded font-medium text-xs hover:bg-clover-50">
            Jetzt installieren
          </button>
        </div>
      )}
      {!updateDownloaded && updateAvailable && (
        <div className="no-print flex items-center gap-3 px-4 py-1.5 bg-zinc-800 text-zinc-300 text-xs z-50">
          <span>Update verfügbar — wird heruntergeladen …</span>
        </div>
      )}

      <TitleBar />
      <Toolbar />
      <TabBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="no-print sidebar-transition overflow-hidden flex-shrink-0"
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}>
          <Sidebar />
        </div>

        {/* Main area */}
        <main className="print-area flex-1 overflow-hidden">
          {pdfDoc ? <PDFViewer /> : <WelcomeScreen loadPDF={loadPDF} />}
        </main>
      </div>

      <StatusBar />

      {/* Modals — lazily loaded, so Suspense covers the brief chunk fetch on first open */}
      <Suspense fallback={null}>
        {settingsOpen      && <SettingsModal />}
        {propertiesOpen    && <PropertiesModal />}
        {passwordOpen      && <PasswordModal />}
        {splitOpen         && <SplitModal />}
        {ocrOpen           && <OCRModal />}
        {presentationMode  && <PresentationMode />}
        {watermarkOpen     && <WatermarkModal />}
        {signatureOpen     && <SignatureModal />}
        {headerFooterOpen  && <HeaderFooterModal />}
        {compressOpen      && <CompressModal />}
        {exportImagesOpen  && <ExportImagesModal />}
        {qrCodeOpen        && <QRCodeModal />}
        {cropOpen          && <CropModal />}
        {batchOpen         && <BatchModal />}
        {compareOpen       && <CompareView />}
        {shortcutsOpen     && <ShortcutsModal />}
        {printDialogOpen   && <PrintDialog />}
        {sanitizeOpen      && <SanitizeModal />}
        {mailMergeOpen     && <MailMergeModal />}
        {pdfaOpen          && <PdfaExportModal />}
        {a11yOpen          && <AccessibilityCheckModal />}
        {libraryOpen       && <LibraryModal />}
        {encryptOpen       && <EncryptModal />}
        {imagesToPdfOpen   && <ImagesToPdfModal />}
        {altTextOpen       && <AltTextModal />}
        {signatureVerifyOpen && <SignatureVerifyModal />}
      </Suspense>
      <CommandPalette />
    </div>
  )
}
