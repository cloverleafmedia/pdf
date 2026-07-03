import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Trash2, Check, PenTool, ShieldCheck, FileKey, FolderOpen } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

const POSITIONS = [
  { id: 'br', label: 'Unten rechts' },
  { id: 'bc', label: 'Unten Mitte' },
  { id: 'bl', label: 'Unten links' },
  { id: 'tr', label: 'Oben rechts' },
  { id: 'c',  label: 'Mitte' },
]

function calcPos(position, pw, ph, sigW, sigH) {
  const margin = 20
  switch (position) {
    case 'br': return { x: pw - sigW - margin, y: margin }
    case 'bc': return { x: (pw - sigW) / 2,    y: margin }
    case 'bl': return { x: margin,              y: margin }
    case 'tr': return { x: pw - sigW - margin, y: ph - sigH - margin }
    case 'c':  return { x: (pw - sigW) / 2,    y: (ph - sigH) / 2 }
    default:   return { x: pw - sigW - margin, y: margin }
  }
}

export default function SignatureModal() {
  const { pdfBytes, filePath, fileName, currentPage, totalPages, theme, closeSignature, setStatus, openDocument } = useStore()
  const isDark = theme === 'dark'

  const [tab,        setTab]       = useState('draw')
  const [typedText,  setTyped]     = useState('')
  const [position,   setPos]       = useState('br')
  const [targetPage, setPage]      = useState(currentPage)
  const [sigWidth,   setSigW]      = useState(180)
  const [running,    setRunning]   = useState(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [inkColor,   setInkColor]  = useState('#111111')

  // Digital (certificate-based) signature state
  const [certPath,     setCertPath]     = useState('')
  const [certPassword, setCertPassword] = useState('')
  const [signReason,   setSignReason]   = useState('')
  const [signLocation, setSignLocation] = useState('')
  const [signerName,   setSignerName]   = useState('')
  const [signError,    setSignError]    = useState('')

  const canvasRef = useRef(null)
  const ctxRef    = useRef(null)
  const drawing   = useRef(false)
  const lastPos   = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctxRef.current = ctx
  }, [])

  useEffect(() => {
    if (ctxRef.current) ctxRef.current.strokeStyle = inkColor
  }, [inkColor])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY }
  }

  const onStart = (e) => {
    e.preventDefault()
    drawing.current = true
    lastPos.current = getPos(e, canvasRef.current)
  }

  const onMove = (e) => {
    if (!drawing.current || !ctxRef.current) return
    e.preventDefault()
    const pos = getPos(e, canvasRef.current)
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    if (!hasDrawing) setHasDrawing(true)
  }

  const onEnd = () => { drawing.current = false }

  const clearCanvas = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasDrawing(false)
  }

  const getSignaturePng = useCallback(async () => {
    if (tab === 'draw') {
      return new Promise(res => canvasRef.current.toBlob(res, 'image/png'))
    }
    const off = document.createElement('canvas')
    off.width = 600; off.height = 160
    const ctx = off.getContext('2d')
    ctx.clearRect(0, 0, 600, 160)
    ctx.font = 'italic bold 70px "Palatino Linotype", Georgia, "Times New Roman", serif'
    ctx.fillStyle = inkColor
    ctx.textBaseline = 'middle'
    ctx.fillText(typedText, 12, 80)
    return new Promise(res => off.toBlob(res, 'image/png'))
  }, [tab, typedText, inkColor])

  const applySignature = async () => {
    if (tab === 'draw' && !hasDrawing) return
    if (tab === 'type' && !typedText.trim()) return
    setRunning(true)
    try {
      const blob     = await getSignaturePng()
      const arrBuf   = await blob.arrayBuffer()
      const pngBytes = new Uint8Array(arrBuf)

      const doc      = await PDFDocument.load(pdfBytes)
      const pngImage = await doc.embedPng(pngBytes)
      const page     = doc.getPage(targetPage - 1)
      const { width: pw, height: ph } = page.getSize()

      const aspect = pngImage.height / pngImage.width
      const sigW   = sigWidth
      const sigH   = sigW * aspect
      const { x, y } = calcPos(position, pw, ph, sigW, sigH)

      page.drawImage(pngImage, { x, y, width: sigW, height: sigH })

      const newBytes = await doc.save()
      // getDocument() transfers/detaches the buffer it's given — pass a copy.
      const reloaded = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Unterschrift eingebettet')
      closeSignature()
    } catch (e) {
      console.error(e)
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const pickCert = async () => {
    const r = await window.api?.openCert()
    if (!r?.canceled && r?.filePaths?.[0]) { setCertPath(r.filePaths[0]); setSignError('') }
  }

  // Digitally signing is a terminal operation: it writes straight to a new file
  // rather than updating the in-app document, because any further edit + resave
  // through pdf-lib would rewrite the PDF structure and invalidate the signature
  // anyway — better to make that a deliberate "save as" than a silent trap.
  const signWithCertificate = async () => {
    if (!certPath || !pdfBytes) return
    setRunning(true)
    setSignError('')
    try {
      const result = await window.api?.signPDF(pdfBytes, certPath, certPassword, {
        reason: signReason, location: signLocation, name: signerName,
      })
      if (!result?.success) {
        setSignError(result?.error || 'Signieren fehlgeschlagen')
        return
      }
      const saveRes = await window.api?.savePDF(fileName)
      if (saveRes?.canceled || !saveRes?.filePath) return
      await window.api?.writeFile(saveRes.filePath, result.bytes)
      setStatus('Digital signiert und gespeichert: ' + saveRes.filePath.split(/[\\/]/).pop())
      closeSignature()
    } catch (e) {
      setSignError(e.message || 'Unbekannter Fehler')
    } finally {
      setRunning(false)
    }
  }

  const canApply = (tab === 'draw' && hasDrawing) || (tab === 'type' && typedText.trim().length > 0)
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`
  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`

  return (
    <Modal isDark={isDark} onClose={closeSignature} title="Digitale Unterschrift">
      <div className="p-5 space-y-4">

        {/* Tab selector */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
          {[{ id: 'draw', l: '✏️ Zeichnen' }, { id: 'type', l: '⌨️ Tippen' }, { id: 'cert', l: '🔏 Zertifikat' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-sm transition-colors
                ${tab === t.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Digital (certificate) signature */}
        {tab === 'cert' && (
          <div className="space-y-3">
            <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
              <ShieldCheck size={14} className="flex-shrink-0 mt-0.5"/>
              <span>Rechtsverbindliche PKI-Signatur mit einem PKCS#12-Zertifikat (.p12/.pfx). Das Ergebnis wird direkt als neue Datei gespeichert — jede spätere Änderung würde die Signatur ungültig machen.</span>
            </div>

            <div>
              <label className={lbl}>Zertifikat</label>
              <button onClick={pickCert}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <FolderOpen size={14}/>
                {certPath ? certPath.split(/[\\/]/).pop() : 'Zertifikatsdatei wählen (.p12 / .pfx) …'}
              </button>
            </div>

            <div>
              <label className={lbl}>Passwort</label>
              <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)}
                className={inp} placeholder="Zertifikat-Passwort" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Grund (optional)</label>
                <input value={signReason} onChange={e => setSignReason(e.target.value)} className={inp} placeholder="z. B. Genehmigt" />
              </div>
              <div>
                <label className={lbl}>Ort (optional)</label>
                <input value={signLocation} onChange={e => setSignLocation(e.target.value)} className={inp} placeholder="z. B. Berlin" />
              </div>
            </div>
            <div>
              <label className={lbl}>Name (optional)</label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} className={inp} placeholder="Name des Unterzeichners" />
            </div>

            {signError && (
              <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
                <strong>Fehler:</strong> {signError}
              </div>
            )}
          </div>
        )}

        {/* Ink color */}
        {tab !== 'cert' && (
        <div className="flex items-center gap-3">
          <label className={lbl.replace(' mb-1', '')}>Tintenfarbe:</label>
          {['#111111', '#1a3aaf', '#8b0000'].map(c => (
            <button key={c} onClick={() => setInkColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all
                ${inkColor === c ? 'border-clover-400 scale-110' : 'border-transparent hover:border-zinc-400'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        )}

        {/* Draw canvas */}
        {tab === 'draw' && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Mit Maus oder Stift unterschreiben</span>
              <button onClick={clearCanvas}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
                  ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Trash2 size={12} /> Löschen
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={520} height={180}
              className={`w-full rounded-lg border cursor-crosshair
                ${isDark ? 'border-zinc-600' : 'border-gray-300'}`}
              style={{ background: '#ffffff', touchAction: 'none' }}
              onMouseDown={onStart}
              onMouseMove={onMove}
              onMouseUp={onEnd}
              onMouseLeave={onEnd}
              onTouchStart={onStart}
              onTouchMove={onMove}
              onTouchEnd={onEnd}
            />
          </div>
        )}

        {/* Type input */}
        {tab === 'type' && (
          <div className="space-y-2">
            <input value={typedText} onChange={e => setTyped(e.target.value)}
              className={inp} placeholder="Namen oder Text eingeben …" />
            {typedText && (
              <div className={`w-full h-20 flex items-center px-5 rounded-lg border
                ${isDark ? 'border-zinc-600' : 'border-gray-300'}`}
                style={{
                  background: '#ffffff',
                  fontFamily: '"Palatino Linotype", Georgia, "Times New Roman", serif',
                  fontStyle: 'italic',
                  fontWeight: 'bold',
                  fontSize: 38,
                  color: inkColor,
                }}>
                {typedText}
              </div>
            )}
          </div>
        )}

        {/* Page + Width */}
        {tab !== 'cert' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Seite (1–{totalPages})</label>
            <input type="number" min={1} max={totalPages} value={targetPage}
              onChange={e => setPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
              className={inp} />
          </div>
          <div>
            <label className={lbl}>Breite: {sigWidth} pt</label>
            <input type="range" min={60} max={300} step={10} value={sigWidth}
              onChange={e => setSigW(Number(e.target.value))}
              className="w-full mt-2 accent-clover-500" />
          </div>
        </div>
        )}

        {/* Position */}
        {tab !== 'cert' && (
        <div>
          <label className={lbl}>Position auf der Seite</label>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map(p => (
              <button key={p.id} onClick={() => setPos(p.id)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors
                  ${position === p.id
                    ? 'bg-clover-600 text-white border-clover-600'
                    : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeSignature}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        {tab === 'cert' ? (
          <button onClick={signWithCertificate} disabled={running || !certPath || !certPassword}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
            <FileKey size={14} /> {running ? 'Wird signiert …' : 'Signieren & Speichern'}
          </button>
        ) : (
          <button onClick={applySignature} disabled={running || !canApply}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
            <Check size={14} /> {running ? 'Wird eingebettet …' : 'In PDF einbetten'}
          </button>
        )}
      </div>
    </Modal>
  )
}
