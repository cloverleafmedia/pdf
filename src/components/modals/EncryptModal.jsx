import React, { useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { saveAsNewFile } from '../../lib/saveAsNewFile'

// Encryption is deliberately a TERMINAL action — writes straight to a new
// file via Speichern-unter, same reasoning as the certificate signature in
// SignatureModal.jsx: pdf-lib can neither write nor read encrypted PDFs, so
// keeping the encrypted bytes "live" in the editor would break every
// subsequent operation (save, annotate, …) rather than just invalidate a
// signature.
export default function EncryptModal() {
  const {
    pdfBytes, fileName, theme, closeEncrypt, setStatus,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, fileName: state.fileName, theme: state.theme, closeEncrypt: state.closeEncrypt, setStatus: state.setStatus })))
  const isDark = theme === 'dark'

  const [userPassword,  setUserPassword]  = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [allowPrint,  setAllowPrint]  = useState(true)
  const [allowCopy,   setAllowCopy]   = useState(true)
  const [allowModify, setAllowModify] = useState(true)
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState('')

  const canRun = pdfBytes && userPassword.trim().length > 0

  const run = async () => {
    if (!canRun) return
    setRunning(true)
    setError('')
    try {
      const result = await window.api?.encryptPDF(pdfBytes, {
        userPassword: userPassword.trim(),
        ownerPassword: ownerPassword.trim(),
        allowPrint, allowCopy, allowModify,
      })
      if (!result?.available) {
        setError('qpdf ist nicht gebündelt (nur in Entwicklung ohne "npm run setup:qpdf" oder in einem Build ohne diesen Schritt).')
        return
      }
      if (!result.success) {
        setError(result.error || 'Verschlüsselung fehlgeschlagen')
        return
      }
      const savedPath = await saveAsNewFile(fileName, result.bytes)
      if (!savedPath) return
      setStatus('Verschlüsselt gespeichert: ' + savedPath.split(/[\\/]/).pop())
      closeEncrypt()
    } catch (e) {
      setError(e.message || 'Unbekannter Fehler')
    } finally {
      setRunning(false)
    }
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`
  const lbl = `block text-xs font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`

  return (
    <Modal isDark={isDark} onClose={closeEncrypt} title="PDF verschlüsseln">
      <div className="p-5 space-y-4" style={{ minWidth: 400 }}>
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <Lock size={14} className="flex-shrink-0 mt-0.5"/>
          <span>Setzt eine 256-Bit-AES-Verschlüsselung (qpdf). Schreibt direkt in eine neue Datei — das geöffnete Dokument bleibt unverschlüsselt bearbeitbar.</span>
        </div>

        <div>
          <label className={lbl}>Passwort zum Öffnen (erforderlich)</label>
          <input type="password" className={inp} value={userPassword} onChange={e => setUserPassword(e.target.value)} placeholder="Passwort" autoFocus/>
        </div>
        <div>
          <label className={lbl}>Eigentümer-Passwort (optional, für Berechtigungen)</label>
          <input type="password" className={inp} value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Leer = gleich wie Öffnen-Passwort"/>
        </div>

        <div>
          <label className={lbl}>Berechtigungen</label>
          <div className="space-y-1.5">
            {[
              ['Drucken erlauben', allowPrint, setAllowPrint],
              ['Kopieren/Extrahieren erlauben', allowCopy, setAllowCopy],
              ['Bearbeiten erlauben', allowModify, setAllowModify],
            ].map(([label, val, setter]) => (
              <label key={label} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors
                ${isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-clover-500"/>
                <span className={isDark ? 'text-zinc-200' : 'text-gray-800'}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 flex items-start gap-2">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5"/> {error}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeEncrypt}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Abbrechen
        </button>
        <button onClick={run} disabled={running || !canRun}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <Lock size={14}/> {running ? 'Wird verschlüsselt …' : 'Verschlüsseln & Speichern unter …'}
        </button>
      </div>
    </Modal>
  )
}
