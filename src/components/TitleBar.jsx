import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function TitleBar() {
  const { fileName, isDirty, theme } = useStore()
  const [isMax, setIsMax] = useState(false)
  const isDark = theme === 'dark'

  useEffect(() => {
    window.api?.isMaximized().then(setIsMax)
    window.api?.onWindowState(setIsMax)
  }, [])

  const title = fileName ? `${fileName}${isDirty ? ' •' : ''} — CloverleafPDF` : 'CloverleafPDF'

  return (
    <div className={`flex items-center h-10 flex-shrink-0 titlebar-drag
      ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'} border-b`}>

      {/* Logo + Name */}
      <div className="flex items-center gap-2 px-4 titlebar-nodrag select-none">
        <CloverIcon />
        <span className={`text-sm font-semibold tracking-wide ${isDark ? 'text-clover-400' : 'text-clover-600'}`}>
          CloverleafPDF
        </span>
      </div>

      {/* File title – centred */}
      <div className="flex-1 flex justify-center items-center pointer-events-none">
        <span className={`text-xs truncate max-w-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
          {title}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-stretch titlebar-nodrag h-full">
        <WinBtn icon={<Minus size={14} />} onClick={() => window.api?.minimize()}
                hover="hover:bg-zinc-700" isDark={isDark} />
        <WinBtn icon={isMax ? <Square size={12} /> : <Maximize2 size={12} />}
                onClick={() => window.api?.maximize()} hover="hover:bg-zinc-700" isDark={isDark} />
        <WinBtn icon={<X size={14} />} onClick={() => window.api?.close()}
                hover="hover:bg-red-600" isDark={isDark} />
      </div>
    </div>
  )
}

function WinBtn({ icon, onClick, hover, isDark }) {
  return (
    <button onClick={onClick}
      className={`w-12 flex items-center justify-center transition-colors
        ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-white'} ${hover}`}>
      {icon}
    </button>
  )
}

function CloverIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="8.5"  cy="8.5"  r="4.5" fill="#10b981" opacity="0.9"/>
      <circle cx="15.5" cy="8.5"  r="4.5" fill="#10b981" opacity="0.75"/>
      <circle cx="8.5"  cy="15.5" r="4.5" fill="#10b981" opacity="0.75"/>
      <circle cx="15.5" cy="15.5" r="4.5" fill="#10b981" opacity="0.6"/>
      <rect x="11" y="17" width="2" height="5" rx="1" fill="#10b981"/>
    </svg>
  )
}
