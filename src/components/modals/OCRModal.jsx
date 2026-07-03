import React, { useState, useRef, useCallback } from 'react'
import { ScanText, Copy, Download, ChevronDown } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

const LANGS = [
  { id: 'deu',     label: 'Deutsch' },
  { id: 'eng',     label: 'English' },
  { id: 'deu+eng', label: 'Deutsch + Englisch' },
  { id: 'fra',     label: 'Français' },
  { id: 'spa',     label: 'Español' },
]

async function pageToCanvas(pdfDoc, pageNum, scale = 2) {
  const page = pdfDoc.getPage(pageNum)
  const vp   = (await page).getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width  = vp.width
  canvas.height = vp.height
  await (await page).render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  return canvas
}

export default function OCRModal() {
  const { pdfDoc, totalPages, currentPage, theme, closeOCR, setStatus } = useStore()
  const [lang,     setLang]     = useState('deu+eng')
  const [scope,    setScope]    = useState('current')
  const [progress, setProgress] = useState(0)
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState('')
  const [error,    setError]    = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const isDark   = theme === 'dark'
  const abortRef = useRef(false)

  const runOCR = useCallback(async () => {
    if (!pdfDoc) return
    setRunning(true)
    setResult('')
    setError('')
    setProgress(0)
    abortRef.current = false

    const pages = scope === 'all'
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : [currentPage]

    let fullText = ''

    try {
      // Dynamic import — Tesseract.js is large, load on demand
      const Tesseract = (await import('tesseract.js')).default

      for (let i = 0; i < pages.length; i++) {
        if (abortRef.current) break
        const pageNum = pages[i]

        // Render page to canvas element
        const canvas = await pageToCanvas(pdfDoc, pageNum, 2)

        const { data } = await Tesseract.recognize(canvas, lang, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const base = (i / pages.length) * 100
              const part = (m.progress / pages.length) * 100
              setProgress(Math.round(base + part))
            }
          },
        })

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
              </div>
            </div>
            <textarea readOnly value={result} rows={8}
              className={`w-full text-xs p-3 rounded-lg border resize-none font-mono leading-relaxed
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-gray-50 border-gray-200 text-gray-700'}
                focus:outline-none`}/>
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
