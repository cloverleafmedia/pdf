import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'
import { formatBytes } from '../../lib/formatBytes'

export default function PropertiesModal() {
  const { t } = useTranslation()
  const {
    pdfDoc, fileSize, fileName, theme, closeProperties,
  } = useStore(useShallow(state => ({ pdfDoc: state.pdfDoc, fileSize: state.fileSize, fileName: state.fileName, theme: state.theme, closeProperties: state.closeProperties })))
  const [meta, setMeta] = useState({})
  const isDark = theme === 'dark'

  useEffect(() => {
    if (!pdfDoc) return
    pdfDoc.getMetadata().then(({ info }) => setMeta(info || {})).catch(() => {})
  }, [pdfDoc])

  const rows = [
    { label: t('document.title'),    value: meta.Title    },
    { label: t('document.author'),   value: meta.Author   },
    { label: t('document.subject'),  value: meta.Subject  },
    { label: t('document.keywords'), value: meta.Keywords },
    { label: t('document.creator'),  value: meta.Creator  },
    { label: t('document.producer'), value: meta.Producer },
    { label: t('document.created'),  value: meta.CreationDate },
    { label: t('document.modified'), value: meta.ModDate  },
    { label: t('document.pages'),    value: pdfDoc?.numPages },
    { label: t('document.fileSize'), value: formatBytes(fileSize) },
    { label: t('document.version'),  value: meta.PDFFormatVersion },
    { label: t('document.encrypted'),value: meta.IsEncrypted ? t('document.yes') : t('document.no') },
  ]

  return (
    <Modal isDark={isDark} onClose={closeProperties} title={t('document.propertiesTitle')}>
      <div className="overflow-y-auto max-h-96 p-5">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => r.value ? (
              <tr key={r.label} className={`border-b ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                <td className={`py-2 pr-4 font-medium w-32 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{r.label}</td>
                <td className={`py-2 break-all ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{String(r.value)}</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
        {fileName && (
          <div className={`mt-3 text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{fileName}</div>
        )}
      </div>
      <div className={`flex justify-end px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeProperties}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors">
          {t('action.ok')}
        </button>
      </div>
    </Modal>
  )
}
