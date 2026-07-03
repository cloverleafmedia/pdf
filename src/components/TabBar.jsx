import React from 'react'
import { X, Plus } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function TabBar() {
  const { pdfDoc, fileName, filePath, isDirty, activeTabId, tabs, switchTab, closeTab, theme } = useStore()
  const isDark = theme === 'dark'

  // Current document = one virtual tab entry
  const currentTab = pdfDoc ? { id: activeTabId, fileName, filePath, isDirty, isCurrent: true } : null
  const allTabs = [
    ...tabs.map(t => ({ id: t.id, fileName: t.fileName, filePath: t.filePath, isDirty: t.isDirty, isCurrent: false })),
    ...(currentTab ? [currentTab] : []),
  ]

  const openNewFile = async () => {
    const r = await window.api?.openPDF()
    if (!r?.canceled && r?.filePaths?.[0]) window._loadPDF?.(r.filePaths[0], true)
  }

  if (allTabs.length <= 1 && !tabs.length) return null

  return (
    <div className={`flex items-end h-8 overflow-x-auto flex-shrink-0 border-b select-none no-print
      ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
      {allTabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => !tab.isCurrent && switchTab(tab.id)}
          className={`flex items-center gap-1.5 px-3 h-full max-w-[180px] min-w-[80px] cursor-pointer
            border-r text-xs flex-shrink-0 group transition-colors
            ${tab.isCurrent
              ? isDark ? 'bg-zinc-900 text-zinc-100 border-zinc-800' : 'bg-white text-gray-900 border-gray-200'
              : isDark ? 'bg-zinc-950 text-zinc-500 hover:text-zinc-300 border-zinc-800' : 'bg-gray-100 text-gray-500 hover:text-gray-700 border-gray-200'
            }`}>
          <span className="truncate flex-1 leading-none">
            {tab.isDirty && <span className="text-clover-400 mr-0.5">●</span>}
            {tab.fileName || 'Unbenannt'}
          </span>
          <button
            onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors
              opacity-0 group-hover:opacity-100
              ${isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-200 text-gray-500'}`}>
            <X size={10}/>
          </button>
        </div>
      ))}
      <button
        onClick={openNewFile}
        title="Neue Datei in Tab öffnen"
        className={`flex-shrink-0 w-8 h-full flex items-center justify-center transition-colors
          ${isDark ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}>
        <Plus size={14}/>
      </button>
    </div>
  )
}
