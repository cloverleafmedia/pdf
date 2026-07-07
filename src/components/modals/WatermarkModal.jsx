import React, { useState } from 'react'
import { Stamp, FolderOpen, X } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import TemplateBar from './TemplateBar'
import RotationPresetButtons from './RotationPresetButtons'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { embedAppFont } from '../../lib/embeddedFont'
import { bytesToBase64, base64ToBytes } from '../../lib/base64'

const COLORS = [
  { hex: '#888888', label: 'Grau' },
  { hex: '#cc0000', label: 'Rot' },
  { hex: '#111111', label: 'Schwarz' },
  { hex: '#0044cc', label: 'Blau' },
]

export default function WatermarkModal() {
  const {
    pdfBytes, filePath, fileName, currentPage, totalPages, theme, closeWatermark, setStatus, openDocument, watermarkTemplates, saveWatermarkTemplate, deleteWatermarkTemplate,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, currentPage: state.currentPage, totalPages: state.totalPages, theme: state.theme, closeWatermark: state.closeWatermark, setStatus: state.setStatus, openDocument: state.openDocument, watermarkTemplates: state.watermarkTemplates, saveWatermarkTemplate: state.saveWatermarkTemplate, deleteWatermarkTemplate: state.deleteWatermarkTemplate })))
  const isDark = theme === 'dark'

  const [mode,     setMode]    = useState('text') // 'text' | 'image'
  const [text,     setText]    = useState('VERTRAULICH')
  const [fontSize, setFs]      = useState(52)
  const [opacity,  setOpacity] = useState(25)
  const [rotation, setRotation] = useState(45)
  const [colorHex, setColor]   = useState('#888888')
  const [scope,    setScope]   = useState('all')
  const [running,  setRunning] = useState(false)
  const [customImage, setCustomImage] = useState(null) // { bytes, ext, aspect, previewUrl }
  const [imageScale,  setImageScale]  = useState(40) // % of page width
  const [imageError,  setImageError]  = useState('')

  const pickImage = async () => {
    setImageError('')
    const r = await window.api?.openImages()
    if (r?.canceled || !r?.filePaths?.length) return
    const filePath = r.filePaths[0]
    const buf = await window.api?.readFile(filePath)
    const bytes = new Uint8Array(buf)
    const ext = /\.jpe?g$/i.test(filePath) ? 'jpg' : 'png'
    const previewUrl = URL.createObjectURL(new Blob([bytes], { type: ext === 'jpg' ? 'image/jpeg' : 'image/png' }))

    const aspect = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 1)
      img.onerror = () => resolve(1)
      img.src = previewUrl
    })

    setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext, aspect, previewUrl } })
  }

  const clearCustomImage = () => {
    setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null })
  }

  const apply = async () => {
    if (!pdfBytes) return
    if (mode === 'text' && !text.trim()) return
    if (mode === 'image' && !customImage) { setImageError('Bitte zuerst ein Bild wählen.'); return }
    setRunning(true)
    try {
      const doc = await PDFDocument.load(pdfBytes)
      const pageIndices = scope === 'all' ? doc.getPageIndices() : [currentPage - 1]

      if (mode === 'image') {
        const isJpg = customImage.ext === 'jpg' || customImage.ext === 'jpeg'
        const image = isJpg ? await doc.embedJpg(customImage.bytes) : await doc.embedPng(customImage.bytes)
        for (const idx of pageIndices) {
          const page = doc.getPage(idx)
          const { width: pw, height: ph } = page.getSize()
          const w = pw * (imageScale / 100)
          const h = w * customImage.aspect
          page.drawImage(image, {
            x: (pw - w) / 2,
            y: (ph - h) / 2,
            width: w,
            height: h,
            opacity: opacity / 100,
            rotate: degrees(rotation),
          })
        }
      } else {
        const font = await embedAppFont(doc, true)
        const r = parseInt(colorHex.slice(1, 3), 16) / 255
        const g = parseInt(colorHex.slice(3, 5), 16) / 255
        const b = parseInt(colorHex.slice(5, 7), 16) / 255

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
      }

      const newBytes = await doc.save()
      const reloaded = await reloadPdfDoc(newBytes)
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

  const loadTemplate = (config) => {
    setText(config.text ?? 'VERTRAULICH')
    setFs(config.fontSize ?? 52)
    setOpacity(config.opacity ?? 25)
    setRotation(config.rotation ?? 45)
    setColor(config.colorHex ?? '#888888')
    setScope(config.scope ?? 'all')
    if (config.mode === 'image' && config.imageBase64) {
      const bytes = base64ToBytes(config.imageBase64)
      const previewUrl = URL.createObjectURL(new Blob([bytes], { type: config.imageExt === 'jpg' ? 'image/jpeg' : 'image/png' }))
      setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext: config.imageExt, aspect: config.aspect ?? 1, previewUrl } })
      setImageScale(config.imageScale ?? 40)
      setMode('image')
    } else {
      setMode('text')
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeWatermark} title="Wasserzeichen">
      <div className="p-5 space-y-4 max-w-md">

        {/* Vorlagen */}
        <TemplateBar
          isDark={isDark}
          templates={watermarkTemplates}
          onLoad={loadTemplate}
          onSave={(name) => saveWatermarkTemplate(name, mode === 'image'
            ? { mode, opacity, rotation, scope, imageBase64: customImage ? bytesToBase64(customImage.bytes) : undefined, imageExt: customImage?.ext, aspect: customImage?.aspect, imageScale }
            : { mode, text, fontSize, opacity, rotation, colorHex, scope })}
          onDelete={deleteWatermarkTemplate}
        />

        {/* Mode */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
          {[{ id: 'text', l: 'Text' }, { id: 'image', l: 'Eigenes Bild' }].map(opt => (
            <button key={opt.id} onClick={() => setMode(opt.id)}
              className={`flex-1 py-2 text-sm transition-colors
                ${mode === opt.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {opt.l}
            </button>
          ))}
        </div>

        {mode === 'text' && (
          <div>
            <label className={lbl}>Text</label>
            <input value={text} onChange={e => setText(e.target.value)} className={inp} placeholder="Wasserzeichen-Text" />
          </div>
        )}

        {mode === 'image' && (
          <div className="space-y-2">
            {customImage ? (
              <div className={`flex items-center gap-3 p-2 rounded-lg border ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                <img src={customImage.previewUrl} alt="Wasserzeichen-Vorschau" className="h-12 w-auto rounded border border-black/10 bg-white/50 object-contain"/>
                <span className={`flex-1 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Bild geladen</span>
                <button onClick={clearCustomImage} className="text-red-400 hover:text-red-300">
                  <X size={14}/>
                </button>
              </div>
            ) : (
              <button onClick={pickImage}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <FolderOpen size={14}/> Bild wählen (PNG/JPG) …
              </button>
            )}
            {imageError && <div className="text-xs text-red-400">{imageError}</div>}
          </div>
        )}

        {/* Size + Opacity */}
        <div className="grid grid-cols-2 gap-3">
          {mode === 'text' ? (
            <div>
              <label className={lbl}>Schriftgröße: {fontSize}pt</label>
              <input type="range" min={16} max={96} step={4} value={fontSize}
                onChange={e => setFs(Number(e.target.value))}
                className="w-full mt-1 accent-clover-500" />
            </div>
          ) : (
            <div>
              <label className={lbl}>Größe: {imageScale}%</label>
              <input type="range" min={10} max={80} step={5} value={imageScale}
                onChange={e => setImageScale(Number(e.target.value))}
                className="w-full mt-1 accent-clover-500" />
            </div>
          )}
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
          <RotationPresetButtons
            options={[{ v: 45, l: '45°' }, { v: -45, l: '-45°' }, { v: 0, l: '0°' }, { v: 90, l: '90°' }]}
            value={rotation} onChange={setRotation} isDark={isDark}/>
        </div>

        {/* Color */}
        {mode === 'text' && (
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
        )}

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
          {mode === 'image' ? (
            customImage
              ? <img src={customImage.previewUrl} alt="Vorschau" className="mx-auto"
                  style={{ width: `${imageScale}%`, opacity: opacity / 100, transform: `rotate(${-rotation}deg)` }} />
              : <div className={`text-xs ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>Kein Bild ausgewählt</div>
          ) : (
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
          )}
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeWatermark}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={running || (mode === 'text' ? !text.trim() : !customImage)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Stamp size={14} /> {running ? 'Wird angewendet …' : 'Anwenden'}
        </button>
      </div>
    </Modal>
  )
}
