import React from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import pkg from '../../package.json'

function fmt(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function StatusBar() {
  const { t } = useTranslation()
  const { pdfDoc, currentPage, totalPages, zoom, fileName, fileSize, theme, statusMessage, activeTool, language, setLanguage } = useStore()
  const isDark = theme === 'dark'

  const toolLabels = {
    hand: 'Hand', select: 'Auswahl', highlight: 'Markieren', underline: 'Unterstreichen',
    strikethrough: 'Durchstreichen', note: 'Notiz', text: 'Textfeld', draw: 'Zeichnen', eraser: 'Radierer',
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
          {fileSize > 0 && <span>{fmt(fileSize)}</span>}
          <span>|</span>
          <span>{toolLabels[activeTool] || activeTool}</span>
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
      <button
        onClick={() => setLanguage(language === 'de' ? 'en' : 'de')}
        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
          ${isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
        {language === 'de' ? 'DE' : 'EN'}
      </button>

      <span className={isDark ? 'text-zinc-700' : 'text-gray-300'}>CloverleafPDF v{pkg.version}</span>
    </div>
  )
}
