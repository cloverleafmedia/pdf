import React, { useState, useRef, useCallback } from 'react'
import { ScanText, Copy, Download, ChevronDown, FileSearch } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { renderPageToCanvas } from '../../lib/renderPage'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { embedAppFont } from '../../lib/embeddedFont'

const LANGS = [
  { id: 'deu',     label: 'Deutsch' },
  { id: 'eng',     label: 'English' },
  { id: 'deu+eng', label: 'Deutsch + Englisch' },
  { id: 'fra',     label: 'Français' },
  { id: 'spa',     label: 'Español' },
  { id: 'ita',     label: 'Italiano' },
  { id: 'chi_sim', label: '中文' },
  { id: 'pol',     label: 'Polski' },
  { id: 'jpn',     label: '日本語' },
  { id: 'por',     label: 'Português' },
  { id: 'rus',     label: 'Русский' },
  { id: 'kor',     label: '한국어' },
  { id: 'tur',     label: 'Türkçe' },
]

const OCR_SCALE = 2

// Tesseract.js v7 only returns plain text by default (`blocks: false`) — word-level
// bounding boxes (needed to place an invisible text layer) require the lower-level
// worker API with an explicit `{ blocks: true }` output request; the convenience
// `Tesseract.recognize()` wrapper has no way to pass that through.
function extractWords(data) {
  const words = []
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const w of line.words || []) words.push(w)
      }
    }
  }
  return words
}

// Embed the recognized words as an invisible (opacity 0) text layer at their
// scanned position, so the PDF becomes searchable/selectable without changing
// how it looks. Word bounding boxes come back in canvas-pixel space (at
// OCR_SCALE); converting to PDF points just undoes that scale and flips Y.
async function embedSearchableLayer(pdfBytes, pageWords) {
  const { PDFDocument } = await import('pdf-lib')
  const doc  = await PDFDocument.load(pdfBytes)
  const font = await embedAppFont(doc)

  for (const [pageNumStr, words] of Object.entries(pageWords)) {
    const page = doc.getPage(Number(pageNumStr) - 1)
    if (!page) continue
    const { height: ph } = page.getSize()

    for (const w of words) {
      const text = w.text?.trim()
      if (!text) continue
      const { x0, y0, x1, y1 } = w.bbox
      const boxH = (y1 - y0) / OCR_SCALE
      if (boxH < 2) continue
      const fontSize = Math.max(4, boxH * 0.85)
      page.drawText(text, {
        x: x0 / OCR_SCALE,
        y: ph - y1 / OCR_SCALE,
        size: fontSize,
        font,
        opacity: 0,
      })
    }
  }

  return doc.save()
}

export default function OCRModal() {
  const {
    pdfDoc, pdfBytes, filePath, fileName, totalPages, currentPage, theme, closeOCR, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, totalPages: state.totalPages, currentPage: state.currentPage, theme: state.theme, closeOCR: state.closeOCR, setStatus: state.setStatus, openDocument: state.openDocument })))
  const [lang,     setLang]     = useState('deu+eng')
  const [scope,    setScope]    = useState('current')
  const [progress, setProgress] = useState(0)
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState('')
  const [error,    setError]    = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const isDark   = theme === 'dark'
  const abortRef = useRef(false)
  const pageWordsRef = useRef({})
  const currentRecognizingPage = useRef(null)

  const runOCR = useCallback(async () => {
    if (!pdfDoc) return
    setRunning(true)
    setResult('')
    setError('')
    setProgress(0)
    abortRef.current = false
    pageWordsRef.current = {}

    const pages = scope === 'all'
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : [currentPage]

    let fullText = ''

    let worker = null
    try {
      // Dynamic import — Tesseract.js is large, load on demand.
      // Uses the lower-level worker API (not the Tesseract.recognize() convenience
      // wrapper) so we can request `{ blocks: true }` and get word-level bounding
      // boxes — needed to place an invisible, searchable text layer afterwards.
      const Tesseract = (await import('tesseract.js')).default
      worker = await Tesseract.createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const i = pages.indexOf(currentRecognizingPage.current)
            const base = (i / pages.length) * 100
            const part = (m.progress / pages.length) * 100
            setProgress(Math.round(base + part))
          }
        },
      })

      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current) break
        const pageNum = pages[i]
        currentRecognizingPage.current = pageNum

        // Render page to canvas element
        const canvas = await renderPageToCanvas(pdfDoc, pageNum, OCR_SCALE)
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })

        pageWordsRef.current[pageNum] = extractWords(data)

        if (pages.length > 1) fullText += `\n\n─── Seite ${pageNum} ───\n\n`
        fullText += data.text.trim()
        setResult(fullText)
        setProgress(Math.round(((i + 1) / pages.length) * 100))
      }

      setStatus('OCR abgeschlossen')
    } catch (e) {
      console.error('OCR error:', e)
      setError(e.message || 'Unbekannter Fehler')
      setStatus('OCR Fehler')
    } finally {
      await worker?.terminate()
      setRunning(false)
    }
  }, [pdfDoc, lang, scope, currentPage, totalPages])

  const copy = () => { navigator.clipboard.writeText(result); setStatus('Text kopiert') }

  const saveAsText = async () => {
    const r = await window.api?.savePDF('ocr-ergebnis.pdf')
    if (!r?.canceled && r?.filePath) {
      const txtPath = r.filePath.replace(/\.[^.]+$/, '.txt')
      await window.api?.writeFile(txtPath, new TextEncoder().encode(result))
      setStatus('Gespeichert: ' + txtPath.split(/[\\/]/).pop())
    }
  }

  const saveSearchablePDF = async () => {
    if (!Object.keys(pageWordsRef.current).length) return
    setEmbedding(true)
    try {
      setStatus('Durchsuchbare PDF wird erstellt …')
      const newBytes = await embedSearchableLayer(pdfBytes, pageWordsRef.current)
      const reloaded = await reloadPdfDoc(newBytes)
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Text-Ebene eingebettet — jetzt speichern (Strg+S) um es dauerhaft zu machen')
      closeOCR()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setEmbedding(false)
    }
  }

  const selectedLang = LANGS.find(l => l.id === lang)

  return (
    <Modal isDark={isDark} onClose={closeOCR} title="Texterkennung (OCR)">
      <div className="p-5 space-y-4">

        {/* Lang + scope row */}
        <div className="flex gap-3">
          {/* Language dropdown */}
          <div className="flex-1 relative">
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              Sprache
            </label>
            <button onClick={() => setLangOpen(o => !o)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-800'}`}>
              {selectedLang?.label} <ChevronDown size={14}/>
            </button>
            {langOpen && (
              <div className={`absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border py-1 shadow-2xl
                ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
                {LANGS.map(l => (
                  <button key={l.id} onClick={() => { setLang(l.id); setLangOpen(false) }}
                    className={`block w-full text-left px-3 py-1.5 text-sm transition-colors
                      ${l.id === lang ? 'text-clover-400' : isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scope */}
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              Bereich
            </label>
            <div className="flex rounded-lg overflow-hidden border"
              style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
              {[
                { id: 'current', label: `S. ${currentPage}` },
                { id: 'all',     label: `Alle (${totalPages})` },
              ].map(opt => (
                <button key={opt.id} onClick={() => setScope(opt.id)}
                  className={`flex-1 py-2 text-sm transition-colors
                    ${scope === opt.id
                      ? 'bg-clover-600 text-white'
                      : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info note */}
        {!running && !result && (
          <div className={`text-xs p-3 rounded-lg ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
            Beim ersten Start werden Sprachdaten (~4 MB) heruntergeladen und gecacht.
          </div>
        )}

        {/* Progress */}
        {running && (
          <div>
            <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              <span>Erkennung läuft …</span>
              <span>{progress}%</span>
            </div>
            <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}>
              <div className="h-full bg-clover-500 rounded-full transition-all duration-300"
                style={{ width: progress + '%' }}/>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
            <strong>Fehler:</strong> {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Erkannter Text</span>
              <div className="flex gap-1">
                <button onClick={copy} title="Kopieren"
                  className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
                  <Copy size={13}/>
                </button>
                <button onClick={saveAsText} title="Als TXT speichern"
                  className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
                  <Download size={13}/>
                </button>
                <button onClick={saveSearchablePDF} disabled={embedding} title="Erkannten Text unsichtbar ins PDF einbetten (durchsuchbar/kopierbar machen)"
                  className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'} disabled:opacity-50`}>
                  <FileSearch size={13}/>
                </button>
              </div>
            </div>
            <textarea readOnly value={result} rows={8}
              className={`w-full text-xs p-3 rounded-lg border resize-none font-mono leading-relaxed
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-gray-50 border-gray-200 text-gray-700'}
                focus:outline-none`}/>
            <p className={`text-[11px] mt-1.5 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              <FileSearch size={11} className="inline -mt-0.5 mr-1"/>
              legt eine unsichtbare, durchsuchbare Text-Ebene über den Scan (Aussehen bleibt unverändert)
            </p>
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeOCR}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        {running ? (
          <button onClick={() => { abortRef.current = true }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors">
            Abbrechen
          </button>
        ) : (
          <button onClick={runOCR}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors">
            <ScanText size={14}/> OCR starten
          </button>
        )}
      </div>
    </Modal>
  )
}
