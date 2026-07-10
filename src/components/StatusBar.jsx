import React from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, TriangleAlert, ChevronUp } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import pkg from '../../package.json'
import { formatBytes } from '../lib/formatBytes'
import { useFloatingMenu, FloatingMenu } from './FloatingMenu.jsx'
import { LANGUAGES } from '../i18n/languages'

export default function StatusBar() {
  const { t } = useTranslation()
  const {
    pdfDoc, currentPage, totalPages, zoom, fileName, fileSize, theme, statusMessage, activeTool, language, setLanguage, hasSignatures, openSignatureVerify, hasJavaScriptActions,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, currentPage: state.currentPage, totalPages: state.totalPages, zoom: state.zoom, fileName: state.fileName, fileSize: state.fileSize, theme: state.theme, statusMessage: state.statusMessage, activeTool: state.activeTool, language: state.language, setLanguage: state.setLanguage, hasSignatures: state.hasSignatures, openSignatureVerify: state.openSignatureVerify, hasJavaScriptActions: state.hasJavaScriptActions })))
  const isDark = theme === 'dark'
  const langMenu = useFloatingMenu({ placement: 'above' })
  const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0]

  const toolLabels = {
    hand: 'Hand', select: 'Auswahl', highlight: 'Markieren', underline: 'Unterstreichen',
    strikethrough: 'Durchstreichen', note: 'Notiz', text: 'Textfeld', draw: 'Zeichnen', eraser: 'Radierer',
    newfield: 'Formularfeld erstellen', shape: 'Form',
  }

  return (
    <div className={`flex items-center h-6 px-3 gap-4 flex-shrink-0 text-[11px] border-t no-print
      ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>

      {pdfDoc ? (
        <>
          <span className={isDark ? 'text-clover-500' : 'text-clover-600'}>
            {t('status.page')} {currentPage} {t('status.of')} {totalPages}
          </span>
          <span>|</span>
          <span>{Math.round(zoom)}%</span>
          {fileName && (
            <>
              <span>|</span>
              <span className="truncate max-w-xs">{fileName}</span>
            </>
          )}
          {fileSize > 0 && <span>{formatBytes(fileSize)}</span>}
          <span>|</span>
          <span>{toolLabels[activeTool] || activeTool}</span>
          {activeTool === 'form' && (
            <button onClick={() => window._jumpToNextRequiredField?.()}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors
                ${isDark ? 'text-amber-400 hover:bg-zinc-800' : 'text-amber-600 hover:bg-gray-100'}`}
              title="Zum nächsten leeren Pflichtfeld springen">
              Nächstes Pflichtfeld
            </button>
          )}
          {hasSignatures && (
            <>
              <span>|</span>
              <button onClick={openSignatureVerify}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors
                  ${isDark ? 'text-amber-400 hover:bg-zinc-800' : 'text-amber-600 hover:bg-gray-100'}`}
                title="Signiertes Dokument — Signatur prüfen">
                <ShieldCheck size={11}/> Signiert
              </button>
            </>
          )}
          {hasJavaScriptActions && (
            <>
              <span>|</span>
              <span className={`flex items-center gap-1 px-1.5 py-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}
                title="Dieses Dokument enthält eingebettetes JavaScript (Formular-Skripte, Öffnen-Aktion oder Anmerkungs-Aktionen). CloverleafPDF führt es nicht aus, aber andere Betrachter könnten es tun.">
                <TriangleAlert size={11}/> Enthält JavaScript
              </span>
            </>
          )}
        </>
      ) : (
        <span>{t('status.noFile')}</span>
      )}

      {statusMessage && (
        <>
          <span>|</span>
          <span className={isDark ? 'text-clover-400' : 'text-clover-600'}>{statusMessage}</span>
        </>
      )}

      <div className="flex-1" />

      {/* Language switcher */}
      <div className="relative">
        <button
          ref={langMenu.anchorRef}
          onClick={() => langMenu.setOpen(o => !o)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors
            ${isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
          {currentLang.flag} {currentLang.id.toUpperCase()} <ChevronUp size={10}/>
        </button>
        <FloatingMenu open={langMenu.open} pos={langMenu.pos} menuRef={langMenu.menuRef}>
          <div className={`min-w-[140px] rounded-lg border shadow-lg overflow-hidden text-xs
            ${isDark ? 'bg-zinc-850 border-zinc-700' : 'bg-white border-gray-200'}`}>
            {LANGUAGES.map(opt => (
              <button key={opt.id}
                onClick={() => { setLanguage(opt.id); langMenu.setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors
                  ${opt.id === language
                    ? isDark ? 'bg-clover-600/20 text-clover-400' : 'bg-clover-50 text-clover-700'
                    : isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                {opt.flag} {opt.name}
              </button>
            ))}
          </div>
        </FloatingMenu>
      </div>

      <span className={isDark ? 'text-zinc-700' : 'text-gray-300'}>CloverleafPDF v{pkg.version}</span>
    </div>
  )
}
