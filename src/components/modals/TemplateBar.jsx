import React, { useState } from 'react'
import { Save, Trash2, ChevronDown } from 'lucide-react'

// Small reusable "load / save named preset" row, shared by WatermarkModal and
// HeaderFooterModal so users don't have to re-enter the same settings every time.
export default function TemplateBar({ isDark, templates, onLoad, onSave, onDelete }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const confirmSave = () => {
    if (!name.trim()) return
    onSave(name.trim())
    setName('')
    setNaming(false)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <button onClick={() => setOpen(o => !o)}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-lg border transition-colors
            ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <span>{templates.length ? 'Vorlage laden …' : 'Keine Vorlagen gespeichert'}</span>
          <ChevronDown size={12}/>
        </button>
        {open && templates.length > 0 && (
          <div className={`absolute z-50 top-full mt-1 left-0 right-0 rounded-lg border py-1 shadow-2xl max-h-48 overflow-y-auto
            ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
            {templates.map(t => (
              <div key={t.id} className="flex items-center">
                <button onClick={() => { onLoad(t.config); setOpen(false) }}
                  className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors
                    ${isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                  {t.name}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(t.id) }} title="Vorlage löschen"
                  className={`px-2 py-1.5 transition-colors ${isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-300 hover:text-red-500'}`}>
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {naming ? (
        <div className="flex items-center gap-1">
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmSave(); if (e.key === 'Escape') setNaming(false) }}
            placeholder="Name …"
            className={`w-28 px-2 py-1.5 text-xs rounded-lg border outline-none focus:border-clover-500
              ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`}/>
          <button onClick={confirmSave} className="px-2.5 py-1.5 rounded-lg text-xs bg-clover-600 hover:bg-clover-700 text-white transition-colors">✓</button>
          <button onClick={() => setNaming(false)}
            className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100'}`}>✕</button>
        </div>
      ) : (
        <button onClick={() => setNaming(true)} title="Aktuelle Einstellungen als Vorlage speichern"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors flex-shrink-0
            ${isDark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          <Save size={12}/> Speichern
        </button>
      )}
    </div>
  )
}
