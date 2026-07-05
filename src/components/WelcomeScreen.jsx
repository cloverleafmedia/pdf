import React from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Eye, Edit3, Layers, Shield, Clock, FileText } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import cloverIcon from '../assets/clover-icon.png'

export default function WelcomeScreen({ loadPDF }) {
  const { t } = useTranslation()
  const {
    recentFiles, theme,
  } = useStore(useShallow(state => ({ recentFiles: state.recentFiles, theme: state.theme })))
  const isDark = theme === 'dark'

  const openDialog = async () => {
    const r = await window.api?.openPDF()
    if (!r?.canceled && r?.filePaths?.[0]) loadPDF(r.filePaths[0])
  }

  const features = [
    { icon: <Eye size={22}/>,    label: t('welcome.features.view'),    desc: t('welcome.features.viewDesc') },
    { icon: <Edit3 size={22}/>,  label: t('welcome.features.edit'),    desc: t('welcome.features.editDesc') },
    { icon: <Layers size={22}/>, label: t('welcome.features.manage'),  desc: t('welcome.features.manageDesc') },
    { icon: <Shield size={22}/>, label: t('welcome.features.protect'), desc: t('welcome.features.protectDesc') },
  ]

  return (
    <div className={`h-full overflow-y-auto flex flex-col items-center justify-start pt-16 pb-8
      ${isDark ? 'bg-zinc-950' : 'bg-gray-100'}`}>

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <img src={cloverIcon} alt="" width={64} height={64} draggable={false} />
        <h1 className={`text-3xl font-bold tracking-tight ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>
          CloverleafPDF
        </h1>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
          {t('welcome.subtitle')}
        </p>
      </div>

      {/* Open button */}
      <button
        onClick={openDialog}
        className="flex items-center gap-3 px-8 py-4 rounded-xl bg-clover-600 hover:bg-clover-700 text-white font-semibold text-base transition-all shadow-lg hover:shadow-clover-900/40 active:scale-95 mb-3">
        <FolderOpen size={20}/>
        {t('welcome.openPDF')}
      </button>
      <p className={`text-xs mb-10 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
        {t('welcome.openPDFHint')}
      </p>

      {/* Feature cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-8 mb-10 max-w-2xl w-full">
        {features.map(f => (
          <div key={f.label}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-colors
              ${isDark ? 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700' : 'bg-white border border-gray-200 hover:border-gray-300'}`}>
            <div className={isDark ? 'text-clover-400' : 'text-clover-600'}>{f.icon}</div>
            <span className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{f.label}</span>
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{f.desc}</span>
          </div>
        ))}
      </div>

      {/* Recent files */}
      {recentFiles.length > 0 && (
        <div className="max-w-xl w-full px-8">
          <div className={`flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-widest
            ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
            <Clock size={13}/> {t('welcome.recentFiles')}
          </div>
          <div className="space-y-1">
            {recentFiles.slice(0, 8).map((f, i) => (
              <button key={i} onClick={() => loadPDF(f.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                  ${isDark ? 'hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100' : 'hover:bg-white text-gray-700 hover:text-gray-900'}`}>
                <FileText size={15} className={isDark ? 'text-clover-500' : 'text-clover-600'} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate font-medium">{f.name}</div>
                  <div className={`text-[10px] truncate ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{f.path}</div>
                </div>
                <div className={`text-[10px] flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                  {f.time ? new Date(f.time).toLocaleDateString() : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
