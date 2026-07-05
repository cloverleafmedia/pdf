import React from 'react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'

const GROUPS = [
  {
    title: 'Datei',
    items: [
      [['Strg', 'O'], 'Datei öffnen'],
      [['Strg', 'T'], 'Datei in neuem Tab öffnen'],
      [['Strg', 'S'], 'Speichern'],
      [['Strg', 'P'], 'Drucken'],
      [['Strg', 'W'], 'Tab / Dokument schließen'],
    ],
  },
  {
    title: 'Bearbeiten',
    items: [
      [['Strg', 'Z'], 'Rückgängig'],
      [['Strg', 'Y'], 'Wiederholen'],
      [['Strg', 'Enter'], 'Notiz / Textfeld speichern (bei aktiver Eingabe)'],
      [['Esc'], 'Eingabe abbrechen / Werkzeug auf Hand zurücksetzen'],
    ],
  },
  {
    title: 'Ansicht & Zoom',
    items: [
      [['Strg', 'K'], 'Befehle durchsuchen'],
      [['?'], 'Diese Übersicht anzeigen'],
      [['Strg', 'B'], 'Sidebar ein-/ausblenden'],
      [['Strg', 'F'], 'Suche öffnen'],
      [['Strg', '+'], 'Vergrößern'],
      [['Strg', '-'], 'Verkleinern'],
      [['Strg', '0'], 'Zoom zurücksetzen'],
      [['F5'], 'Präsentationsmodus starten/beenden'],
    ],
  },
  {
    title: 'Navigation',
    sep: '/',
    items: [
      [['→', '↓', 'Bild ↓'], 'Nächste Seite'],
      [['←', '↑', 'Bild ↑'], 'Vorherige Seite'],
      [['Pos1'], 'Erste Seite'],
      [['Ende'], 'Letzte Seite'],
      [['Leertaste'], 'Nächste Seite (im Präsentationsmodus)'],
    ],
  },
]

export default function ShortcutsModal() {
  const {
    theme, closeShortcuts,
  } = useStore(useShallow(state => ({ theme: state.theme, closeShortcuts: state.closeShortcuts })))
  const isDark = theme === 'dark'

  return (
    <Modal isDark={isDark} onClose={closeShortcuts} title="Tastenkombinationen">
      <div className="p-5 max-h-[60vh] overflow-y-auto space-y-5">
        {GROUPS.map(g => (
          <div key={g.title}>
            <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{g.title}</div>
            <div className="space-y-1.5">
              {g.items.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>{label}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {keys.map((part, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-gray-300'}`}>{g.sep || '+'}</span>}
                        <kbd
                          className={`text-[11px] px-1.5 py-0.5 rounded border font-mono
                            ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-gray-50 border-gray-300 text-gray-600'}`}>
                          {part}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={`flex justify-end px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeShortcuts}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-clover-600 hover:bg-clover-700 text-white transition-colors">
          Schließen
        </button>
      </div>
    </Modal>
  )
}
