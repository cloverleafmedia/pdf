import React, { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, FolderOpen, X } from 'lucide-react'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import TemplateBar from './TemplateBar'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { embedAppFont } from '../../lib/embeddedFont'
import { bytesToBase64, base64ToBytes } from '../../lib/base64'
import { visualPageSize, visualPointToRawPoint } from '../../lib/pageRotation'
import { normalizeImageOrientation } from '../../lib/normalizeImageOrientation'

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
    pdfBytes, filePath, fileName, totalPages, theme, closeHeaderFooter, setStatus, openDocument, headerFooterTemplates, saveHeaderFooterTemplate, deleteHeaderFooterTemplate,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, totalPages: state.totalPages, theme: state.theme, closeHeaderFooter: state.closeHeaderFooter, setStatus: state.setStatus, openDocument: state.openDocument, headerFooterTemplates: state.headerFooterTemplates, saveHeaderFooterTemplate: state.saveHeaderFooterTemplate, deleteHeaderFooterTemplate: state.deleteHeaderFooterTemplate })))
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
  const [logoImage,    setLogoImage]    = useState(null) // { bytes, ext, aspect, previewUrl }
  const [logoPosition, setLogoPosition] = useState('header') // 'header' | 'footer'
  const [logoAlign,    setLogoAlign]    = useState('right')
  const [logoScale,    setLogoScale]    = useState(10) // % of page width
  const [logoError,    setLogoError]    = useState('')

  const pickLogoImage = async () => {
    setLogoError('')
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

    setLogoImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext, aspect, previewUrl } })
  }

  const clearLogoImage = () => {
    setLogoImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return null })
  }

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

      let logo = null
      if (logoImage) {
        const isJpg = logoImage.ext === 'jpg' || logoImage.ext === 'jpeg'
        logo = isJpg ? await doc.embedJpg(logoImage.bytes) : await doc.embedPng(logoImage.bytes)
      }

      for (let i = 0; i < pages.length; i++) {
        const page  = pages[i]
        const { width: pw, height: ph } = page.getSize()
        // pdf-lib always draws in raw (pre-/Rotate) page space, but "header"
        // and "footer" are inherently visual concepts (top/bottom edge as
        // the reader actually sees the page) - a page with a native /Rotate
        // baked in (routine for scanned documents/exhibits, the exact case
        // Bates numbering below is meant for) needs its raw draw position
        // AND the text/logo's own orientation counter-rotated, or content
        // meant for the visual top ends up on the visual bottom (180°) or
        // on a side edge, sideways (90°/270°). Verified by pixel-sampling
        // the actual render, not just by checking that the feature "ran".
        const nativeRotation = page.getRotation().angle
        const { width: vw, height: vh } = visualPageSize(pw, ph, nativeRotation)
        const counterRotate = nativeRotation ? degrees(-nativeRotation) : undefined
        const n     = i + startNum
        const total = pages.length + startNum - 1
        const margin = 18

        const bates = batesPrefix + String(i + batesStart).padStart(batesDigits, '0')
        const resolve = (tmpl) =>
          tmpl.replace(/\{n\}/gi, String(n)).replace(/\{total\}/gi, String(total)).replace(/\{bates\}/gi, bates)

        const drawText = (text, visualY) => {
          if (!text.trim()) return
          const resolved = resolve(text)
          const tw = font.widthOfTextAtSize(resolved, fontSize)
          let visualX
          if (align === 'left')   visualX = margin
          else if (align === 'right') visualX = vw - tw - margin
          else visualX = (vw - tw) / 2
          const { x, y } = visualPointToRawPoint(visualX, visualY, pw, ph, nativeRotation)
          page.drawText(resolved, { x, y, size: fontSize, font, color, rotate: counterRotate })
        }

        drawText(headerText, vh - margin - fontSize)
        drawText(footerText, margin)

        if (logo) {
          const w = vw * (logoScale / 100)
          const h = w * logoImage.aspect
          let visualX
          if (logoAlign === 'left')   visualX = margin
          else if (logoAlign === 'right') visualX = vw - w - margin
          else visualX = (vw - w) / 2
          const visualY = logoPosition === 'header' ? vh - margin - h : margin
          const { x, y } = visualPointToRawPoint(visualX, visualY, pw, ph, nativeRotation)
          page.drawImage(logo, { x, y, width: w, height: h, rotate: counterRotate })
        }
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
    setLogoPosition(config.logoPosition ?? 'header')
    setLogoAlign(config.logoAlign ?? 'right')
    setLogoScale(config.logoScale ?? 10)
    if (config.logoBase64) {
      const bytes = base64ToBytes(config.logoBase64)
      const previewUrl = URL.createObjectURL(new Blob([bytes], { type: config.logoExt === 'jpg' ? 'image/jpeg' : 'image/png' }))
      setLogoImage(prev => { if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl); return { bytes, ext: config.logoExt, aspect: config.logoAspect ?? 1, previewUrl } })
    } else {
      clearLogoImage()
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeHeaderFooter} title="Kopf- & Fußzeile">
      <div className="p-5 space-y-4 max-w-md">

        {/* Vorlagen */}
        <TemplateBar
          isDark={isDark}
          templates={headerFooterTemplates}
          onLoad={loadTemplate}
          onSave={(name) => saveHeaderFooterTemplate(name, {
            headerText, footerText, fontSize, align, startNum, colorHex, batesPrefix, batesStart, batesDigits,
            logoPosition, logoAlign, logoScale,
            logoBase64: logoImage ? bytesToBase64(logoImage.bytes) : undefined, logoExt: logoImage?.ext, logoAspect: logoImage?.aspect,
          })}
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

        {/* Logo (optional) */}
        <div>
          <label className={lbl}>Logo (optional)</label>
          {logoImage ? (
            <div className={`flex items-center gap-3 p-2 rounded-lg border ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
              <img src={logoImage.previewUrl} alt="Logo-Vorschau" className="h-10 w-auto rounded border border-black/10 bg-white/50 object-contain"/>
              <span className={`flex-1 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Bild geladen</span>
              <button onClick={clearLogoImage} className="text-red-400 hover:text-red-300">
                <X size={14}/>
              </button>
            </div>
          ) : (
            <button onClick={pickLogoImage}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              <FolderOpen size={14}/> Bild wählen (PNG/JPG) …
            </button>
          )}
          {logoError && <div className="text-xs text-red-400 mt-1">{logoError}</div>}

          {logoImage && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: isDark ? '#3f3f46' : '#e5e7eb' }}>
                {[{ id: 'header', l: 'Kopfzeile' }, { id: 'footer', l: 'Fußzeile' }].map(opt => (
                  <button key={opt.id} onClick={() => setLogoPosition(opt.id)}
                    className={`flex-1 py-1.5 text-xs transition-colors
                      ${logoPosition === opt.id ? 'bg-clover-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {ALIGN_OPTS.map(opt => (
                  <button key={opt.id} onClick={() => setLogoAlign(opt.id)}
                    className={`flex-1 py-1.5 flex items-center justify-center rounded-lg border transition-colors
                      ${logoAlign === opt.id
                        ? 'bg-clover-600 text-white border-clover-600'
                        : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {opt.icon}
                  </button>
                ))}
              </div>
              <div className="col-span-2">
                <label className={`${lbl} mt-1`}>Größe: {logoScale}%</label>
                <input type="range" min={5} max={30} step={1} value={logoScale}
                  onChange={e => setLogoScale(Number(e.target.value))}
                  className="w-full accent-clover-500" />
              </div>
            </div>
          )}
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
          {(headerText || (logoImage && logoPosition === 'header')) && (
            <div className={`flex items-center gap-2 text-xs border-b pb-1.5 mb-2 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}
              style={{ justifyContent: logoAlign === 'left' ? 'flex-start' : logoAlign === 'right' ? 'flex-end' : 'center' }}>
              {logoImage && logoPosition === 'header' && <img src={logoImage.previewUrl} alt="" className="h-4 w-auto object-contain"/>}
              {/* {n}/{total} must mirror apply()'s actual formula (n = pageIndex +
                  startNum, total = pageCount + startNum - 1) - showing plain
                  page-1/totalPages here would make the preview lie the moment
                  startNum isn't 1. */}
              <span style={{ textAlign: align, color: colorHex, fontSize: fontSize + 2 }}>
                {headerText.replace(/\{n\}/gi, String(startNum)).replace(/\{total\}/gi, String(totalPages + startNum - 1)).replace(/\{bates\}/gi, batesPrefix + String(batesStart).padStart(batesDigits, '0'))}
              </span>
            </div>
          )}
          <div className={`text-xs text-center ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>… Seiteninhalt …</div>
          {(footerText || (logoImage && logoPosition === 'footer')) && (
            <div className={`flex items-center gap-2 text-xs border-t pt-1.5 mt-2 ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}
              style={{ justifyContent: logoAlign === 'left' ? 'flex-start' : logoAlign === 'right' ? 'flex-end' : 'center' }}>
              {logoImage && logoPosition === 'footer' && <img src={logoImage.previewUrl} alt="" className="h-4 w-auto object-contain"/>}
              <span style={{ textAlign: align, color: colorHex, fontSize: fontSize + 2 }}>
                {footerText.replace(/\{n\}/gi, String(startNum)).replace(/\{total\}/gi, String(totalPages + startNum - 1)).replace(/\{bates\}/gi, batesPrefix + String(batesStart).padStart(batesDigits, '0'))}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeHeaderFooter}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={apply} disabled={running || (!headerText.trim() && !footerText.trim() && !logoImage)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          {running ? 'Wird eingebettet …' : `Alle ${totalPages} Seiten einbetten`}
        </button>
      </div>
    </Modal>
  )
}
