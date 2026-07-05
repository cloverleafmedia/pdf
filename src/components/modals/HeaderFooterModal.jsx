import React, { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { PDFDocument, rgb } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'
import TemplateBar from './TemplateBar'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { embedAppFont } from '../../lib/embeddedFont'

const ALIGN_OPTS = [
  { id: 'left',   icon: <AlignLeft size={13}/> },
  { id: 'center', icon: <AlignCenter size={13}/> },
  { id: 'right',  icon: <AlignRight size={13}/> },
]

function TextRow({ label, value, onChange, isDark }) {
  const inp = `flex-1 px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`
  return (
    <div>
      <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className={inp}
        placeholder="z. B.  {n} / {total}   oder   Firmenname" />
    </div>
  )
}

export default function HeaderFooterModal() {
  const {
    pdfBytes, filePath, fileName, totalPages, theme, closeHeaderFooter, setStatus, openDocument,
    headerFooterTemplates, saveHeaderFooterTemplate, deleteHeaderFooterTemplate,
  } = useStore()
  const isDark = theme === 'dark'

  const [headerText,  setHeader]  = useState('{n} / {total}')
  const [footerText,  setFooter]  = useState('')
  const [fontSize,    setFs]      = useState(9)
  const [align,       setAlign]   = useState('center')
  const [startNum,    setStart]   = useState(1)
  const [colorHex,    setColor]   = useState('#555555')
  const [running,     setRunning] = useState(false)
  const [batesPrefix, setBatesPrefix] = useState('')
  const [batesStart,  setBatesStart]  = useState(1)
  const [batesDigits, setBatesDigits] = useState(6)

  const apply = async () => {
    if (!pdfBytes) return
    setRunning(true)
    try {
      const doc  = await PDFDocument.load(pdfBytes)
      const font = await embedAppFont(doc)
      const r = parseInt(colorHex.slice(1, 3), 16) / 255
      const g = parseInt(colorHex.slice(3, 5), 16) / 255
      const b = parseInt(colorHex.slice(5, 7), 16) / 255
      const color = rgb(r, g, b)
      const pages = doc.getPages()

      for (let i = 0; i < pages.length; i++) {
        const page  = pages[i]
        const { width: pw, height: ph } = page.getSize()
        const n     = i + startNum
        const total = pages.length + startNum - 1
        const margin = 18

        const bates = batesPrefix + String(i + batesStart).padStart(batesDigits, '0')
        const resolve = (tmpl) =>
          tmpl.replace(/\{n\}/gi, String(n)).replace(/\{total\}/gi, String(total)).replace(/\{bates\}/gi, bates)

        const drawText = (text, yPos) => {
          if (!text.trim()) return
          const resolved = resolve(text)
          const tw = font.widthOfTextAtSize(resolved, fontSize)
          let x
          if (align === 'left')   x = margin
          else if (align === 'right') x = pw - tw - margin
          else x = (pw - tw) / 2
          page.drawText(resolved, { x, y: yPos, size: fontSize, font, color })
        }

        drawText(headerText, ph - margin - fontSize)
        drawText(footerText, margin)
      }

      const newBytes = await doc.save()
      const reloaded = await reloadPdfDoc(newBytes)
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      setStatus('Kopf-/Fußzeile eingebettet')
      closeHeaderFooter()
    } catch (e) {
      console.error(e)
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  const loadTemplate = (config) => {
    setHeader(config.headerText ?? '{n} / {total}')
    setFooter(config.footerText ?? '')
    setFs(config.fontSize ?? 9)
    setAlign(config.align ?? 'center')
    setStart(config.startNum ?? 1)
    setColor(config.colorHex ?? '#555555')
    setBatesPrefix(config.batesPrefix ?? '')
    setBatesStart(config.batesStart ?? 1)
    setBatesDigits(config.batesDigits ?? 6)
  }

  return (
    <Modal isDark={isDark} onClose={closeHeaderFooter} title="Kopf- & Fußzeile">
      <div className="p-5 space-y-4 max-w-md">

        {/* Vorlagen */}
        <TemplateBar
          isDark={isDark}
          templates={headerFooterTemplates}
          onLoad={loadTemplate}
          onSave={(name) => saveHeaderFooterTemplate(name, { headerText, footerText, fontSize, align, startNum, colorHex, batesPrefix, batesStart, batesDigits })}
          onDelete={deleteHeaderFooterTemplate}
        />

        {/* Header / Footer inputs */}
        <TextRow label="Kopfzeile" value={headerText} onChange={setHeader} isDark={isDark} />
        <TextRow label="Fußzeile"  value={footerText} onChange={setFooter} isDark={isDark} />

        {/* Hint */}
        <div className={`text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          Platzhalter: <code className="font-mono">{'{n}'}</code> = aktuelle Seite &nbsp;·&nbsp;
          <code className="font-mono">{'{total}'}</code> = Gesamtanzahl &nbsp;·&nbsp;
          <code className="font-mono">{'{bates}'}</code> = Bates-Nummer
        </div>

        {/* Bates numbering */}
        <div>
          <label className={lbl}>Bates-Nummerierung (z. B. für <code className="font-mono">{'{bates}'}</code> in Kopf-/Fußzeile)</label>
          <div className="grid grid-cols-3 gap-2">
            <input value={batesPrefix} onChange={e => setBatesPrefix(e.target.value)}
              placeholder="Präfix, z. B. DOC-"
              className={`px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}/>
            <input type="number" min={0} value={batesStart} onChange={e => setBatesStart(Math.max(0, Number(e.target.value) || 0))}
              title="Startnummer"
              className={`px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}/>
            <input type="number" min={1} max={12} value={batesDigits} onChange={e => setBatesDigits(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
              title="Anzahl Stellen (führende Nullen)"
              className={`px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}/>
          </div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
            Beispiel: {batesPrefix}{String(batesStart).padStart(batesDigits, '0')}
          </div>
        </div>

        {/* Font size + Start number */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Schriftgröße: {fontSize}pt</label>
            <input type="range" min={6} max={14} step={1} value={fontSize}
              onChange={e => setFs(Number(e.target.value))}
              className="w-full mt-1 accent-clover-500" />
          </div>
          <div>
            <label className={lbl}>Nummerierung ab</label>
            <input type="number" min={0} value={startNum}
              onChange={e => setStart(Math.max(0, Number(e.target.value) || 1))}
              className={`w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}
            />
          </div>
        </div>

        {/* Alignment */}
        <div>
          <label className={lbl}>Ausrichtung</label>
          <div className="flex gap-2">
            {ALIGN_OPTS.map(opt => (
              <button key={opt.id} onClick={() => setAlign(opt.id)}
                className={`flex-1 py-2 flex items-center justify-center rounded-lg border transition-colors
                  ${align === opt.id
                    ? 'bg-clover-600 text-white border-clover-600'
                    : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {opt.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className={lbl}>Farbe</label>
          <div className="flex items-center gap-2">
            {['#555555', '#999999', '#111111', '#1a3aaf', '#cc0000'].map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all
                  ${colorHex === c ? 'border-clover-400 scale-110' : 'border-transparent hover:border-zinc-400'}`}
                style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={colorHex} onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer p-0 border-0 bg-transparent" title="Benutzerdefiniert" />
          </div>
        </div>

        {/* Preview */}
        <div className={`rounded-lg border px-4 py-3 relative ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-[10px] uppercase tracking-widest mb-1 ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>Vorschau (Seite 1 / {totalPages})</div>
          {headerText && (
            <div className={`text-xs border-b pb-1.5 mb-2 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}
              style={{ textAlign: align, color: colorHex, fontSize: fontSize + 2 }}>
              {headerText.replace(/\{n\}/gi, '1').replace(/\{total\}/gi, String(totalPages)).replace(/\{bates\}/gi, batesPrefix + String(batesStart).padStart(batesDigits, '0'))}
            </div>
          )}
          <div className={`text-xs text-center ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>… Seiteninhalt …</div>
          {footerText && (
            <div className={`text-xs border-t pt-1.5 mt-2 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}
              style={{ textAlign: align, color: colorHex, fontSize: fontSize + 2 }}>
              {footerText.replace(/\{n\}/gi, '1').replace(/\{total\}/gi, String(totalPages)).replace(/\{bates\}/gi, batesPrefix + String(batesStart).padStart(batesDigits, '0'))}
            </div>
          )}
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeHeaderFooter}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={running || (!headerText.trim() && !footerText.trim())}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          {running ? 'Wird eingebettet …' : `Alle ${totalPages} Seiten einbetten`}
        </button>
      </div>
    </Modal>
  )
}
