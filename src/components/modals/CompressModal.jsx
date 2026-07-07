import React, { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { reloadPdfDoc } from '../../lib/reloadPdfDoc'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { formatBytes } from '../../lib/formatBytes'
import { findCompressibleImages, replaceImage } from '../../lib/imageCompress'

// Decodes a JPEG's raw bytes to a bitmap and re-encodes it at the given
// quality via canvas - the browser-native decode/encode path, same idiom
// ExportImagesModal.jsx already uses for page rasterization.
async function reencodeJpeg(bytes, quality) {
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  const newBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  return new Uint8Array(await newBlob.arrayBuffer())
}

export default function CompressModal() {
  const {
    pdfBytes, filePath, fileName, theme, closeCompress, setStatus, openDocument,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, filePath: state.filePath, fileName: state.fileName, theme: state.theme, closeCompress: state.closeCompress, setStatus: state.setStatus, openDocument: state.openDocument })))
  const isDark = theme === 'dark'
  const [removeMetadata,  setRemoveMeta]  = useState(true)
  const [objectStreams,   setObjStreams]   = useState(true)
  const [compressImages,  setCompressImages] = useState(true)
  const [imageQuality,    setImageQuality]   = useState(70)
  const [running,         setRunning]      = useState(false)
  const [resultSize,      setResultSize]   = useState(null)
  const [imageStats,      setImageStats]   = useState(null) // { found, compressed }

  const compress = async () => {
    if (!pdfBytes) return
    setRunning(true)
    setResultSize(null)
    setImageStats(null)
    try {
      const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

      if (removeMetadata) {
        doc.setTitle('')
        doc.setAuthor('')
        doc.setSubject('')
        doc.setKeywords([])
        doc.setProducer('')
        doc.setCreator('')
      }

      let stats = null
      if (compressImages) {
        const images = findCompressibleImages(doc)
        let compressedCount = 0
        for (const entry of images) {
          try {
            const newBytes = await reencodeJpeg(entry.bytes, imageQuality / 100)
            // Only swap in the re-encoded version if it's actually smaller -
            // an already well-compressed image could grow at a "lower"
            // quality setting depending on its content.
            if (newBytes.length < entry.bytes.length) {
              await replaceImage(doc, entry, newBytes)
              compressedCount++
            }
          } catch (_) { /* image failed to decode (unexpected JPEG variant) - leave it untouched */ }
        }
        stats = { found: images.length, compressed: compressedCount }
        setImageStats(stats)
      }

      const newBytes = await doc.save({ useObjectStreams: objectStreams })
      setResultSize(newBytes.byteLength)

      const reloaded = await reloadPdfDoc(newBytes)
      openDocument(reloaded, newBytes, filePath, fileName, newBytes.byteLength)
      const imgSuffix = stats ? ` · ${stats.compressed}/${stats.found} Bild(er) komprimiert` : ''
      setStatus(`Komprimiert: ${formatBytes(pdfBytes.byteLength)} → ${formatBytes(newBytes.byteLength)}${imgSuffix}`)
      closeCompress()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const saved = pdfBytes && resultSize ? pdfBytes.byteLength - resultSize : 0
  const pct   = pdfBytes && resultSize ? Math.round((1 - resultSize / pdfBytes.byteLength) * 100) : 0

  return (
    <Modal isDark={isDark} onClose={closeCompress} title="PDF komprimieren">
      <div className="p-5 space-y-4 max-w-sm">
        <div className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
          Aktuelle Größe: <span className="font-semibold">{formatBytes(pdfBytes?.byteLength)}</span>
        </div>

        <Option isDark={isDark} checked={removeMetadata} onChange={setRemoveMeta}
          label="Metadaten entfernen"
          hint="Entfernt Autor, Titel, Schlüsselwörter und Erstellungsinformationen" />

        <Option isDark={isDark} checked={objectStreams} onChange={setObjStreams}
          label="Objekt-Streams aktivieren"
          hint="Komprimiert interne PDF-Strukturen (PDF 1.5+)" />

        <div>
          <Option isDark={isDark} checked={compressImages} onChange={setCompressImages}
            label="Bilder komprimieren"
            hint="Verkleinert eingebettete JPEG-Bilder (z. B. Scans/Fotos) auf die gewählte Qualität" />
          {compressImages && (
            <div className="mt-2 ml-7">
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Bildqualität: {imageQuality}%
              </label>
              <input type="range" min={40} max={90} step={5} value={imageQuality}
                onChange={e => setImageQuality(Number(e.target.value))}
                className="w-full accent-clover-500" />
            </div>
          )}
        </div>

        <div className={`text-xs rounded-lg px-3 py-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          Hinweis: "Bilder komprimieren" verkleinert nur bereits als JPEG eingebettete Bilder ohne
          Transparenz. Für Schwarz-Weiß-Scans (CCITT/JBIG2) oder maximale Komprimierung empfiehlt sich
          weiterhin ein spezialisiertes Tool wie Ghostscript.
        </div>

        {resultSize && (
          <div className={`text-sm rounded-lg px-3 py-2 font-medium ${isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
            Ersparnis: {formatBytes(saved)} ({pct}% kleiner)
            {imageStats && ` · ${imageStats.compressed}/${imageStats.found} Bild(er) komprimiert`}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeCompress}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={compress} disabled={running}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50">
          {running ? 'Wird komprimiert …' : 'Komprimieren'}
        </button>
      </div>
    </Modal>
  )
}

function Option({ isDark, checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-clover-500 w-4 h-4 flex-shrink-0" />
      <div>
        <div className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{label}</div>
        <div className={`text-xs mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{hint}</div>
      </div>
    </label>
  )
}
