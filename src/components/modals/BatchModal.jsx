import React, { useState } from 'react'
import { PDFDocument, StandardFonts, degrees, rgb, grayscale } from 'pdf-lib'
import { Trash2, FolderOpen } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from './SettingsModal'

const OPERATIONS = [
  { id: 'compress',   label: 'Komprimieren',    hint: 'Objekt-Streams + Metadaten entfernen' },
  { id: 'watermark',  label: 'Wasserzeichen',   hint: 'Diagonaler Text auf alle Seiten' },
  { id: 'rotate',     label: 'Drehen',          hint: 'Alle Seiten um 90 / 180 / 270° drehen' },
  { id: 'merge',      label: 'Zusammenführen',  hint: 'Alle Dateien zu einer PDF zusammenfügen' },
  { id: 'sign',       label: 'Digital signieren', hint: 'Alle Dateien mit einem Zertifikat signieren' },
]

export default function BatchModal() {
  const { theme, closeBatch, setStatus } = useStore()
  const isDark = theme === 'dark'
  const [files,     setFiles]     = useState([])   // [{name, path}]
  const [op,        setOp]        = useState('compress')
  const [wmText,    setWmText]    = useState('VERTRAULICH')
  const [rotation,  setRot]       = useState(90)
  const [running,   setRunning]   = useState(false)
  const [progress,  setProgress]  = useState('')
  const [certPath,     setCertPath]     = useState('')
  const [certPassword, setCertPassword] = useState('')
  const [signReason,   setSignReason]   = useState('')
  const [signLocation, setSignLocation] = useState('')
  const [signerName,   setSignerName]   = useState('')

  const pickFiles = async () => {
    const r = await window.api?.openPDF()
    if (r?.canceled || !r?.filePaths?.length) return
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.path))
      const newOnes = r.filePaths.filter(p => !existing.has(p)).map(p => ({ path: p, name: p.split(/[\\/]/).pop() }))
      return [...prev, ...newOnes]
    })
  }

  const pickCert = async () => {
    const r = await window.api?.openCert()
    if (r?.canceled || !r?.filePaths?.[0]) return
    setCertPath(r.filePaths[0])
  }

  const run = async () => {
    if (!files.length) return
    setRunning(true)
    try {
      if (op === 'merge') {
        const res = await window.api?.saveDirectory()
        if (res?.canceled || !res?.filePaths?.[0]) { setRunning(false); return }
        const dir = res.filePaths[0]
        setProgress('Zusammenführen …')
        const merged = await PDFDocument.create()
        for (const f of files) {
          const buf  = await window.api?.readFile(f.path)
          const src  = await PDFDocument.load(new Uint8Array(buf))
          const pgs  = await merged.copyPages(src, src.getPageIndices())
          pgs.forEach(p => merged.addPage(p))
        }
        const bytes = await merged.save({ useObjectStreams: true })
        await window.api?.writeFile(dir + '/zusammengefuehrt.pdf', bytes)
        setProgress('')
        setStatus(`Zusammengeführt → zusammengefuehrt.pdf`)
        closeBatch()
        return
      }

      const res = await window.api?.saveDirectory()
      if (res?.canceled || !res?.filePaths?.[0]) { setRunning(false); return }
      const dir = res.filePaths[0]

      // Per-file try/catch: one file's failure no longer silently aborts the
      // whole batch (previously a single bad file threw out of the loop and
      // left every remaining file untouched, with no report of what actually
      // succeeded) - each file now succeeds or fails independently, with a
      // final summary naming exactly which files failed and why.
      const results = { ok: [], failed: [] }
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress(`Verarbeite ${i + 1} / ${files.length}: ${f.name}`)
        try {
          const buf = await window.api?.readFile(f.path)
          let bytes, outName

          if (op === 'sign') {
            // signPdf() does its own PDFDocument.load()/classic re-save
            // internally - passing the raw bytes straight through avoids an
            // unnecessary extra pdf-lib round-trip that only compress/
            // watermark/rotate actually need.
            const signResult = await window.api?.signPDF(new Uint8Array(buf), certPath, certPassword, {
              reason: signReason, location: signLocation, name: signerName,
            })
            if (!signResult?.success) throw new Error(signResult?.error || 'Signieren fehlgeschlagen')
            bytes = signResult.bytes
            outName = f.name.replace('.pdf', '_signiert.pdf')
          } else {
            const doc = await PDFDocument.load(new Uint8Array(buf))
            if (op === 'compress') {
              doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setProducer(''); doc.setCreator('')
            }
            if (op === 'watermark') {
              const font  = await doc.embedFont(StandardFonts.HelveticaBold)
              const color = rgb(0.7, 0, 0)
              for (const page of doc.getPages()) {
                const { width: pw, height: ph } = page.getSize()
                const fSz = Math.min(pw, ph) / 8
                const tw  = font.widthOfTextAtSize(wmText, fSz)
                page.drawText(wmText, {
                  x: (pw - tw) / 2, y: (ph - fSz) / 2, size: fSz, font, color,
                  opacity: 0.25, rotate: degrees(45),
                })
              }
            }
            if (op === 'rotate') {
              for (const page of doc.getPages()) page.setRotation(degrees(rotation))
            }
            bytes = await doc.save({ useObjectStreams: op === 'compress' })
            outName = f.name.replace('.pdf', '_bearbeitet.pdf')
          }

          await window.api?.writeFile(dir + '/' + outName, bytes)
          results.ok.push(f.name)
        } catch (e) {
          results.failed.push({ name: f.name, reason: e.message })
        }
      }
      setProgress('')
      setStatus(results.failed.length
        ? `${results.ok.length}/${files.length} erfolgreich, ${results.failed.length} fehlgeschlagen: ${results.failed.map(x => `${x.name} (${x.reason})`).join('; ')}`
        : `${results.ok.length} Datei(en) verarbeitet → ${dir}`)
      closeBatch()
    } catch (e) {
      setStatus('Fehler: ' + e.message)
      setProgress('')
    } finally {
      setRunning(false)
    }
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`

  return (
    <Modal isDark={isDark} onClose={closeBatch} title="Batch-Verarbeitung">
      <div className="p-5 space-y-4" style={{ minWidth: 420 }}>
        {/* File list */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Dateien ({files.length})</span>
            <button onClick={pickFiles}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-clover-600 hover:bg-clover-700 text-white transition-colors">
              <FolderOpen size={12}/> Hinzufügen
            </button>
          </div>
          <div className={`rounded-lg border min-h-[80px] max-h-[160px] overflow-y-auto
            ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            {files.length === 0
              ? <div className={`p-3 text-xs text-center ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine Dateien – klicke "Hinzufügen"</div>
              : files.map((f, i) => (
                <div key={f.path} className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b last:border-0
                  ${isDark ? 'border-zinc-700' : 'border-gray-100'}`}>
                  <span className={`flex-1 truncate ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-300 flex-shrink-0"><Trash2 size={11}/></button>
                </div>
              ))
            }
          </div>
        </div>

        {/* Operation */}
        <div>
          <div className={`text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Operation</div>
          <div className="grid grid-cols-2 gap-1.5">
            {OPERATIONS.map(o => (
              <button key={o.id} onClick={() => setOp(o.id)}
                className={`px-3 py-2 rounded-lg border text-left transition-colors
                  ${op === o.id ? 'bg-clover-600/20 border-clover-500 text-clover-400' : isDark ? 'border-zinc-700 text-zinc-300 hover:border-zinc-600' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                <div className="text-sm font-medium">{o.label}</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{o.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Operation-specific options */}
        {op === 'watermark' && (
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Wasserzeichen-Text</label>
            <input className={inp} value={wmText} onChange={e => setWmText(e.target.value)} />
          </div>
        )}
        {op === 'rotate' && (
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Rotation</label>
            <div className="flex gap-2">
              {[90, 180, 270].map(r => (
                <button key={r} onClick={() => setRot(r)}
                  className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors
                    ${rotation === r ? 'bg-clover-600 text-white border-clover-600' : isDark ? 'border-zinc-700 text-zinc-300' : 'border-gray-200 text-gray-600'}`}>
                  {r}°
                </button>
              ))}
            </div>
          </div>
        )}

        {op === 'sign' && (
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Zertifikat</label>
              <button onClick={pickCert}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                  ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <FolderOpen size={14}/>
                {certPath ? certPath.split(/[\\/]/).pop() : 'Zertifikatsdatei wählen (.p12 / .pfx) …'}
              </button>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Passwort</label>
              <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)}
                className={inp} placeholder="Zertifikat-Passwort" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Grund (optional)</label>
                <input value={signReason} onChange={e => setSignReason(e.target.value)} className={inp} placeholder="z. B. Genehmigt" />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Ort (optional)</label>
                <input value={signLocation} onChange={e => setSignLocation(e.target.value)} className={inp} placeholder="z. B. Berlin" />
              </div>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Name (optional)</label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} className={inp} placeholder="Name des Unterzeichners" />
            </div>
          </div>
        )}

        {progress && (
          <div className={`text-xs animate-pulse ${isDark ? 'text-clover-400' : 'text-clover-600'}`}>{progress}</div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeBatch}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={run} disabled={running || !files.length || (op === 'sign' && (!certPath || !certPassword))}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50">
          {running ? 'Läuft …' : `${files.length} Datei(en) verarbeiten`}
        </button>
      </div>
    </Modal>
  )
}
