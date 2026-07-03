import React, { useState } from 'react'
import { Stamp } from 'lucide-react'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

const COLORS = [
  { hex: '#888888', label: 'Grau' },
  { hex: '#cc0000', label: 'Rot' },
  { hex: '#111111', label: 'Schwarz' },
  { hex: '#0044cc', label: 'Blau' },
]

export default function WatermarkModal() {
  const { pdfBytes, filePath, fileName, currentPage, totalPages, theme, closeWatermark, setStatus, openDocument } = useStore()
  const isDark = theme === 'dark'

  const [text,     setText]    = useState('VERTRAULICH')
  const [fontSize, setFs]      = useState(52)
  const [opacity,  setOpacity] = useState(25)
  const [rotation, setRotation] = useState(45)
  const [colorHex, setColor]   = useState('#888888')
  const [scope,    setScope]   = useState('all')
  const [running,  setRunning] = useState(false)

  const apply = async () => {
    if (!pdfBytes || !text.trim()) return
    setRunning(true)
    try {
      const doc  = await PDFDocument.load(pdfBytes)
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      const r = parseInt(colorHex.slice(1, 3), 16) / 255
      const g = parseInt(colorHex.slice(3, 5), 16) / 255
      const b = parseInt(colorHex.slice(5, 7), 16) / 255
      const pageIndices = scope === 'all' ? doc.getPageIndices() : [currentPage - 1]

      for (const idx of pageIndices) {
        const page = doc.getPage(idx)
        const { width: pw, height: ph } = page.getSize()
        const tw = font.widthOfTextAtSize(text, fontSize)
        page.drawText(text, {
          x: (pw - tw) / 2,
          y: (ph - fontSize) / 2,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          opacity: opacity / 100,
          rotate: degrees(rotation),
        })
      }

      const newBytes = await doc.save()
      const reloaded = await pdfjsLib.getDocument({ data: newBytes }).promise
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Wasserzeichen hinzugefügt')
      closeWatermark()
    } catch (e) {
      console.error(e)
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const inp = `w-full px-3 py-2 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  return (
    <Modal isDark={isDark} onClose={closeWatermark} title="Wasserzeichen">
      <div className="p-5 space-y-4 max-w-md">

        {/* Text */}
        <div>
          <label className={lbl}>Text</label>
          <input value={text} onChange={e => setText(e.target.value)} className={inp} placeholder="Wasserzeichen-Text" />
        </div>

        {/* Size + Opacity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Schriftgröße: {fontSize}pt</label>
            <input type="range" min={16} max={96} step={4} value={fontSize}
              onChange={e => setFs(Number(e.target.value))}
              className="w-full mt-1 accent-clover-500" />
          </div>
          <div>
            <label className={lbl}>Deckkraft: {opacity}%</label>
            <input type="range" min={5} max={80} step={5} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))}
              className="w-full mt-1 accent-clover-500" />
          </div>
        </div>

        {/* Rotation */}
        <div>
          <label className={lbl}>Winkel</label>
          <div className="flex gap-2">
            {[{ v: 45, l: '45°' }, { v: -45, l: '-45°' }, { v: 0, l: '0°' }, { v: 90, l: '90°' }].map(opt => (
              <button key={opt.v} onClick={() => setRotation(opt.v)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors
                  ${rotation === opt.v
                    ? 'bg-clover-600 text-white border-clover-600'
                    : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className={lbl}>Farbe</label>
          <div className="flex items-center gap-2">
            {COLORS.map(c => (
              <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                className={`w-7 h-7 rounded-full border-2 transition-all
                  ${colorHex === c.hex ? 'border-clover-400 scale-110' : 'border-transparent hover:border-zinc-400'}`}
                style={{ backgroundColor: c.hex }} />
            ))}
            <input type="color" value={colorHex} onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer p-0 border-0 bg-transparent" title="Benutzerdefiniert" />
          </div>
        </div>

        {/* Scope */}
        <div>
          <label className={lbl}>Bereich</label>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
            {[{ id: 'all', l: `Alle (${totalPages})` }, { id: 'current', l: `S. ${currentPage}` }].map(opt => (
              <button key={opt.id} onClick={() => setScope(opt.id)}
                className={`flex-1 py-2 text-sm transition-colors
                  ${scope === opt.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className={`text-center py-8 rounded-lg border relative overflow-hidden
          ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-[10px] mb-2 uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>Vorschau</div>
          <div style={{
            fontSize: Math.min(fontSize * 0.55, 34),
            opacity: opacity / 100,
            color: colorHex,
            transform: `rotate(${-rotation}deg)`,
            fontWeight: 'bold',
            fontFamily: 'Helvetica, Arial, sans-serif',
            letterSpacing: '0.05em',
            userSelect: 'none',
          }}>
            {text || '…'}
          </div>
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeWatermark}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={running || !text.trim()}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Stamp size={14} /> {running ? 'Wird angewendet …' : 'Anwenden'}
        </button>
      </div>
    </Modal>
  )
}
