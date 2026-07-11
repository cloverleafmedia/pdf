import React, { useState } from 'react'
import { Award, FolderOpen, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import TemplateBar from './TemplateBar'
import RotationPresetButtons from './RotationPresetButtons'
import { bytesToBase64, base64ToBytes } from '../../lib/base64'
import { normalizeImageOrientation } from '../../lib/normalizeImageOrientation'

const PRESETS = [
  { id: 'approved',     label: 'Genehmigt',   text: 'GENEHMIGT',    color: '#10b981' },
  { id: 'draft',        label: 'Entwurf',     text: 'ENTWURF',      color: '#f59e0b' },
  { id: 'confidential', label: 'Vertraulich', text: 'VERTRAULICH',  color: '#ef4444' },
]

const FREETEXT_COLORS = [
  { hex: '#111111', label: 'Schwarz' },
  { hex: '#cc0000', label: 'Rot' },
  { hex: '#0044cc', label: 'Blau' },
  { hex: '#10b981', label: 'Grün' },
]

// {datum}/{uhrzeit} are resolved once, at placement time (see place() below)
// - not at save/flatten time like {n}/{total} in HeaderFooterModal, since a
// stamp is a single one-off placement rather than something re-applied to
// every page on save.
function resolvePlaceholders(text) {
  const now = new Date()
  return text
    .replace(/\{datum\}/gi, now.toLocaleDateString('de-DE'))
    .replace(/\{uhrzeit\}/gi, now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))
}

export default function StampModal() {
  const {
    pdfDoc, theme, closeStamp, setActiveTool, setPendingStampConfig, stampTemplates, saveStampTemplate, deleteStampTemplate,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, theme: state.theme, closeStamp: state.closeStamp, setActiveTool: state.setActiveTool, setPendingStampConfig: state.setPendingStampConfig, stampTemplates: state.stampTemplates, saveStampTemplate: state.saveStampTemplate, deleteStampTemplate: state.deleteStampTemplate })))
  const isDark = theme === 'dark'

  const [preset, setPreset] = useState('approved')
  const [customImage, setCustomImage] = useState(null) // { bytes, ext, aspect, previewUrl }
  const [mode, setMode] = useState('preset') // 'preset' | 'custom' | 'freetext'
  const [rotation, setRotation] = useState(0)
  const [freeText, setFreeText] = useState('')
  const [freeColor, setFreeColor] = useState('#111111')
  const [error, setError] = useState('')

  const pickImage = async () => {
    setError('')
    const r = await window.api?.openImages()
    if (r?.canceled || !r?.filePaths?.length) return
    const filePath = r.filePaths[0]
    const buf = await window.api?.readFile(filePath)
    const rawBytes = new Uint8Array(buf)
    const rawExt = /\.jpe?g$/i.test(filePath) ? 'jpg' : 'png'
    // See normalizeImageOrientation.js - pdf-lib ignores EXIF orientation.
    const { bytes, ext } = await normalizeImageOrientation(rawBytes, rawExt)
    const previewUrl = URL.createObjectURL(new Blob([bytes], { type: ext === 'jpg' ? 'image/jpeg' : 'image/png' }))

    const aspect = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 1)
      img.onerror = () => resolve(1)
      img.src = previewUrl
    })

    setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext, aspect, previewUrl } })
    setMode('custom')
  }

  const clearCustomImage = () => {
    setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null })
    setMode('preset')
  }

  // Object URLs aren't persistable across sessions, so a saved template's
  // image (kept as base64, see src/lib/base64.js) gets a fresh one built
  // each time it's loaded, exactly like when an image is first picked.
  // A freetext template has no imageBase64 - detected by its presence/
  // absence rather than a separate stored template "kind" field.
  const loadStampTemplate = (config) => {
    if (config.imageBase64) {
      const bytes = base64ToBytes(config.imageBase64)
      const previewUrl = URL.createObjectURL(new Blob([bytes], { type: config.imageExt === 'jpg' ? 'image/jpeg' : 'image/png' }))
      setCustomImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext: config.imageExt, aspect: config.aspect, previewUrl } })
      setMode('custom')
    } else {
      // Placeholder tokens are stored raw (not pre-resolved) so re-placing
      // this template later picks up the current date/time again.
      setFreeText(config.text ?? '')
      setFreeColor(config.color ?? '#111111')
      setMode('freetext')
    }
    setRotation(config.rotation ?? 0)
    setError('')
  }

  const place = () => {
    if (mode === 'custom') {
      if (!customImage) { setError('Bitte zuerst ein Bild wählen.'); return }
      setPendingStampConfig({ kind: 'custom', imageBytes: customImage.bytes, imageExt: customImage.ext, imageUrl: customImage.previewUrl, aspect: customImage.aspect, rotation })
    } else if (mode === 'freetext') {
      if (!freeText.trim()) { setError('Bitte zuerst Text eingeben.'); return }
      setPendingStampConfig({ kind: 'text', text: resolvePlaceholders(freeText), color: freeColor, rotation })
    } else {
      const p = PRESETS.find(p => p.id === preset)
      setPendingStampConfig({ kind: p.id, text: p.text, color: p.color, rotation })
    }
    setActiveTool('stamp')
    closeStamp()
  }

  return (
    <Modal isDark={isDark} onClose={closeStamp} title="Stempel">
      <div className="p-5 space-y-4" style={{ minWidth: 380 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <Award size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Stempel auswählen, dann auf die Seite klicken zum Platzieren. Position/Größe danach mit dem Hand-Werkzeug anpassbar, bis das Dokument gespeichert wird.</span>
        </div>

        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
          {[{ id: 'preset', l: 'Vorlage' }, { id: 'custom', l: 'Eigenes Bild' }, { id: 'freetext', l: 'Freitext' }].map(t => (
            <button key={t.id} onClick={() => setMode(t.id)}
              className={`flex-1 py-2 text-sm transition-colors
                ${mode === t.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {t.l}
            </button>
          ))}
        </div>

        {mode === 'preset' && (
          <div className="space-y-1.5">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors
                  ${preset === p.id
                    ? 'border-clover-500 bg-clover-600/10'
                    : isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                <span className={isDark ? 'text-zinc-200' : 'text-gray-800'}>{p.label}</span>
                <span className="px-2 py-0.5 rounded border-2 text-xs font-bold tracking-wide"
                  style={{ borderColor: p.color, color: p.color }}>
                  {p.text}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === 'custom' && (
          <div className="space-y-2">
            <TemplateBar
              isDark={isDark}
              templates={stampTemplates}
              onLoad={loadStampTemplate}
              onSave={(name) => customImage && saveStampTemplate(name, { imageBase64: bytesToBase64(customImage.bytes), imageExt: customImage.ext, aspect: customImage.aspect, rotation })}
              onDelete={deleteStampTemplate}
            />
            {customImage ? (
              <div className={`flex items-center gap-3 p-2 rounded-lg border ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
                <img src={customImage.previewUrl} alt="Stempel-Vorschau" className="h-12 w-auto rounded border border-black/10 bg-white/50 object-contain"/>
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
            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
        )}

        {mode === 'freetext' && (
          <div className="space-y-2">
            <TemplateBar
              isDark={isDark}
              templates={stampTemplates}
              onLoad={loadStampTemplate}
              onSave={(name) => freeText.trim() && saveStampTemplate(name, { text: freeText, color: freeColor, rotation })}
              onDelete={deleteStampTemplate}
            />
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={2}
              placeholder="z. B.  GEPRÜFT am {datum}"
              className={`w-full px-3 py-2 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors resize-none
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}/>
            <div className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              Platzhalter: <code className="font-mono">{'{datum}'}</code> = heutiges Datum &nbsp;·&nbsp;
              <code className="font-mono">{'{uhrzeit}'}</code> = aktuelle Uhrzeit
            </div>
            <div className="flex items-center gap-2">
              {FREETEXT_COLORS.map(c => (
                <button key={c.hex} onClick={() => setFreeColor(c.hex)} title={c.label}
                  className={`w-7 h-7 rounded-full border-2 transition-all
                    ${freeColor === c.hex ? 'border-clover-400 scale-110' : 'border-transparent hover:border-zinc-400'}`}
                  style={{ backgroundColor: c.hex }} />
              ))}
              <input type="color" value={freeColor} onChange={(e) => setFreeColor(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer p-0 border-0 bg-transparent" title="Benutzerdefiniert" />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
        )}

        <div>
          <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Winkel</label>
          <RotationPresetButtons
            options={[{ v: 0, l: '0°' }, { v: 15, l: '15°' }, { v: -15, l: '-15°' }, { v: 45, l: '45°' }, { v: -45, l: '-45°' }]}
            value={rotation} onChange={setRotation} isDark={isDark}/>
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeStamp}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={place} disabled={!pdfDoc || (mode === 'custom' && !customImage) || (mode === 'freetext' && !freeText.trim())}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Award size={14}/> Platzieren
        </button>
      </div>
    </Modal>
  )
}
