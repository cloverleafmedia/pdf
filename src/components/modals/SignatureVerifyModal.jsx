import React, { useState } from 'react'
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { formatCertificateInfo, summarizeSignatureResult } from '../../lib/signatureVerifyFormat'

const STATUS_META = {
  'valid':                   { icon: CheckCircle2, tone: 'good',    label: 'Gültige Signatur' },
  'valid-but-expired-cert':  { icon: AlertTriangle, tone: 'warn',    label: 'Gültig, aber Zertifikat abgelaufen' },
  'valid-but-modified-after':{ icon: AlertTriangle, tone: 'warn',    label: 'Gültig zum Zeitpunkt der Signatur — Datei wurde danach verändert' },
  'invalid':                 { icon: XCircle,       tone: 'bad',     label: 'Ungültige Signatur' },
  'unsupported':             { icon: HelpCircle,    tone: 'neutral', label: 'Nicht unterstützter Algorithmus — keine Aussage möglich' },
}

const TONE_CLASSES = {
  good:    { dark: 'text-clover-400', light: 'text-clover-700' },
  warn:    { dark: 'text-amber-400',  light: 'text-amber-600' },
  bad:     { dark: 'text-red-400',    light: 'text-red-600' },
  neutral: { dark: 'text-zinc-400',   light: 'text-gray-500' },
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' }) }
  catch { return '—' }
}

function fmtDateTime(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

export default function SignatureVerifyModal() {
  const {
    pdfBytes, theme, closeSignatureVerify,
  } = useStore(useShallow(state => ({ pdfBytes: state.pdfBytes, theme: state.theme, closeSignatureVerify: state.closeSignatureVerify })))
  const isDark = theme === 'dark'

  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  const run = async () => {
    if (!pdfBytes) return
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const r = await window.api?.verifySignatures(pdfBytes)
      if (!r?.success) setError(r?.error || 'Unbekannter Fehler')
      else setResult(r.signatures)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal isDark={isDark} onClose={closeSignatureVerify} title="Signatur prüfen" maxWidth="max-w-xl">
      <div className="p-5 space-y-4">
        <div className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-50 text-blue-700'}`}>
          <ShieldCheck size={14} className="flex-shrink-0 mt-0.5"/>
          <span>
            Prüft jede in diesem Dokument gefundene digitale Signatur: ob sie kryptografisch gültig ist,
            ob die Datei seither verändert wurde, und Angaben zum Zertifikat des Unterzeichners.
          </span>
        </div>

        {error && (
          <div className="text-xs p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
            <strong>Fehler bei der Prüfung:</strong> {error}
          </div>
        )}

        {result && result.length === 0 && (
          <div className={`text-xs p-3 rounded-lg ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-50 text-gray-600'}`}>
            Keine Signaturen in diesem Dokument gefunden.
          </div>
        )}

        {result && result.length > 0 && (
          <div className="space-y-3">
            {result.map((sig, i) => {
              const cert = formatCertificateInfo(sig.certificate)
              const status = summarizeSignatureResult(sig)
              const meta = STATUS_META[status]
              const Icon = meta.icon
              const toneClass = TONE_CLASSES[meta.tone][isDark ? 'dark' : 'light']

              return (
                <div key={i} className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${toneClass}`}>
                    <Icon size={15}/> {meta.label}
                  </div>
                  {sig.fieldName && (
                    <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Feld: {sig.fieldName}</div>
                  )}
                  {(cert.subjectCN || cert.issuerCN) && (
                    <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                      Unterzeichner: <strong>{cert.subjectCN || '—'}</strong>
                      {cert.issuerCN && <> · Aussteller: {cert.issuerCN}</>}
                    </div>
                  )}
                  {(cert.notBefore || cert.notAfter) && (
                    <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                      Zertifikat gültig: {fmtDate(cert.notBefore)} – {fmtDate(cert.notAfter)}
                      {cert.expired && <span className="text-amber-500"> (abgelaufen)</span>}
                      {cert.notYetValid && <span className="text-amber-500"> (noch nicht gültig)</span>}
                    </div>
                  )}
                  {sig.timestamp?.genTime && (
                    <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                      Zeitgestempelt am: {fmtDateTime(sig.timestamp.genTime)}
                      {sig.timestamp.tsaName && <> (TSA: {sig.timestamp.tsaName})</>}
                    </div>
                  )}
                  {sig.coverage && (
                    <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                      {sig.coverage.coversToEnd
                        ? 'Datei nach dieser Signatur unverändert'
                        : `⚠ ${sig.coverage.trailingBytes} Byte(s) nach dieser Signatur angehängt`}
                    </div>
                  )}
                  {sig.reason && <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Grund: {sig.reason}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeSignatureVerify}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
        <button onClick={run} disabled={running}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-50 disabled:cursor-default">
          <ShieldCheck size={14}/> {running ? 'Wird geprüft …' : 'Signaturen prüfen'}
        </button>
      </div>
    </Modal>
  )
}
