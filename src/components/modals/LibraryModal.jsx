import React, { useState, useEffect, useMemo } from 'react'
import { FolderPlus, Trash2, Search, FileText, Tag, Loader2, Cloud } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { Modal } from './SettingsModal'

const FULLTEXT_SCAN_CAP = 40   // bounded so "Volltext durchsuchen" can't hang on huge libraries
const FULLTEXT_PAGE_CAP = 10   // pages scanned per document

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function LibraryModal() {
  const {
    theme, closeLibrary, libraryFolders, libraryTags, addLibraryFolder, removeLibraryFolder, setLibraryTags,
  } = useStore(useShallow(state => ({ theme: state.theme, closeLibrary: state.closeLibrary, libraryFolders: state.libraryFolders, libraryTags: state.libraryTags, addLibraryFolder: state.addLibraryFolder, removeLibraryFolder: state.removeLibraryFolder, setLibraryTags: state.setLibraryTags })))
  const isDark = theme === 'dark'

  const [files,    setFiles]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [query,    setQuery]    = useState('')
  const [ftLoading, setFtLoading] = useState(false)
  const [ftResults, setFtResults] = useState(null)
  const [tagDrafts, setTagDrafts] = useState({})
  const [cloudCandidates, setCloudCandidates] = useState(null) // null = not yet checked, [] = checked, none found
  const [cloudChecked, setCloudChecked] = useState(new Set())
  const [cloudDetecting, setCloudDetecting] = useState(false)

  const scan = async () => {
    if (!libraryFolders.length) { setFiles([]); return }
    setLoading(true)
    setFtResults(null)
    try {
      const list = await window.api?.libraryScan(libraryFolders)
      setFiles(list || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { scan() }, [libraryFolders])

  const addFolder = async () => {
    const r = await window.api?.pickFolder('Ordner zur Bibliothek hinzufügen')
    if (!r?.canceled && r?.filePaths?.[0]) addLibraryFolder(r.filePaths[0])
  }

  const detectCloudFolders = async () => {
    setCloudDetecting(true)
    try {
      const found = await window.api?.detectCloudFolders() || []
      setCloudCandidates(found.filter(c => !libraryFolders.includes(c.path)))
      setCloudChecked(new Set())
    } finally {
      setCloudDetecting(false)
    }
  }

  const toggleCloudChecked = (p) => {
    setCloudChecked(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }

  const addCheckedCloudFolders = () => {
    for (const p of cloudChecked) addLibraryFolder(p)
    setCloudCandidates(null)
    setCloudChecked(new Set())
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (libraryTags[f.path] || []).some(t => t.toLowerCase().includes(q)))
  }, [files, query, libraryTags])

  const runFullText = async () => {
    if (!query.trim()) return
    setFtLoading(true)
    setFtResults([])
    try {
      const q = query.trim().toLowerCase()
      // Scan the whole library, not the filename-filtered subset — the point of
      // full-text search is to find matches even when the filename itself doesn't.
      const candidates = files.slice(0, FULLTEXT_SCAN_CAP)
      const results = []
      for (const f of candidates) {
        try {
          const buf = await window.api?.readFile(f.path)
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
          const pageCount = Math.min(doc.numPages, FULLTEXT_PAGE_CAP)
          for (let p = 1; p <= pageCount; p++) {
            const page = await doc.getPage(p)
            const content = await page.getTextContent()
            const text = content.items.map(it => it.str).join(' ')
            const idx = text.toLowerCase().indexOf(q)
            if (idx !== -1) {
              const snippet = text.slice(Math.max(0, idx - 40), idx + 60).trim()
              results.push({ path: f.path, name: f.name, page: p, snippet })
              break
            }
          }
        } catch { /* unreadable file — skip */ }
      }
      setFtResults(results)
    } finally {
      setFtLoading(false)
    }
  }

  const openFile = (path) => { window._loadPDF?.(path, true); closeLibrary() }

  const commitTags = (path) => {
    const raw = tagDrafts[path]
    if (raw === undefined) return
    const tags = raw.split(',').map(t => t.trim()).filter(Boolean)
    setLibraryTags(path, tags)
    setTagDrafts(prev => { const next = { ...prev }; delete next[path]; return next })
  }

  const inp = `w-full px-3 py-1.5 text-sm rounded-lg border outline-none focus:border-clover-500 transition-colors
    ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`

  return (
    <Modal isDark={isDark} onClose={closeLibrary} title="Dokumenten-Bibliothek" maxWidth="max-w-3xl">
      <div className="p-5 flex gap-5" style={{ minHeight: 420 }}>
        {/* Folders column */}
        <div className="w-56 flex-shrink-0 space-y-2">
          <div className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Beobachtete Ordner</div>
          <div className={`rounded-lg border min-h-[80px] max-h-[280px] overflow-y-auto
            ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            {libraryFolders.length === 0
              ? <div className={`p-3 text-xs text-center ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine Ordner hinzugefügt</div>
              : libraryFolders.map(f => (
                <div key={f} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-b last:border-0
                  ${isDark ? 'border-zinc-700' : 'border-gray-100'}`}>
                  <span className={`flex-1 truncate ${isDark ? 'text-zinc-300' : 'text-gray-700'}`} title={f}>{f}</span>
                  <button onClick={() => removeLibraryFolder(f)} className="text-red-400 hover:text-red-300 flex-shrink-0">
                    <Trash2 size={11}/>
                  </button>
                </div>
              ))}
          </div>
          <button onClick={addFolder}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-clover-600 hover:bg-clover-700 text-white transition-colors">
            <FolderPlus size={13}/> Ordner hinzufügen
          </button>
          <button onClick={detectCloudFolders} disabled={cloudDetecting}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50
              ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {cloudDetecting ? <Loader2 size={12} className="animate-spin"/> : <Cloud size={12}/>} Cloud-Ordner erkennen
          </button>

          {cloudCandidates !== null && (
            <div className={`rounded-lg border p-2 space-y-1.5 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
              {cloudCandidates.length === 0 ? (
                <div className={`text-[11px] text-center ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine neuen Cloud-Ordner gefunden</div>
              ) : (
                <>
                  {cloudCandidates.map(c => (
                    <label key={c.path} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <input type="checkbox" checked={cloudChecked.has(c.path)} onChange={() => toggleCloudChecked(c.path)} className="accent-clover-500 flex-shrink-0"/>
                      <span className={`truncate ${isDark ? 'text-zinc-300' : 'text-gray-700'}`} title={c.path}>{c.label}</span>
                    </label>
                  ))}
                  <button onClick={addCheckedCloudFolders} disabled={cloudChecked.size === 0}
                    className="w-full px-2 py-1 rounded text-[11px] bg-clover-600 hover:bg-clover-700 text-white transition-colors disabled:opacity-40">
                    Hinzufügen ({cloudChecked.size})
                  </button>
                </>
              )}
            </div>
          )}

          <div className={`text-[11px] ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{files.length} PDF(s) gefunden</div>
        </div>

        {/* Files column */}
        <div className="flex-1 min-w-0 flex flex-col space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}/>
              <input value={query} onChange={e => { setQuery(e.target.value); setFtResults(null) }}
                placeholder="Dateiname oder Tag durchsuchen …" className={inp + ' pl-8'}/>
            </div>
            <button onClick={runFullText} disabled={!query.trim() || ftLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50
                ${isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {ftLoading ? <Loader2 size={12} className="animate-spin"/> : <FileText size={12}/>} Volltext
            </button>
          </div>

          <div className={`flex-1 rounded-lg border overflow-y-auto ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
            {loading && <div className={`p-4 text-xs text-center ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Durchsuche Ordner …</div>}

            {!loading && ftResults !== null && (
              <>
                <div className={`px-3 py-1.5 text-[11px] uppercase tracking-wide ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                  Volltext-Treffer ({ftResults.length}, durchsucht: erste {FULLTEXT_SCAN_CAP} Treffer × {FULLTEXT_PAGE_CAP} Seiten)
                </div>
                {ftResults.length === 0 && <div className={`px-3 pb-3 text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine Treffer</div>}
                {ftResults.map((r, i) => (
                  <button key={i} onClick={() => openFile(r.path)}
                    className={`block w-full text-left px-3 py-2 border-b last:border-0 transition-colors
                      ${isDark ? 'border-zinc-700 hover:bg-zinc-700' : 'border-gray-100 hover:bg-white'}`}>
                    <div className={`text-xs font-medium ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{r.name} · Seite {r.page}</div>
                    <div className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>…{r.snippet}…</div>
                  </button>
                ))}
              </>
            )}

            {!loading && ftResults === null && filtered.length === 0 && (
              <div className={`p-4 text-xs text-center ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                {files.length === 0 ? 'Füge links einen Ordner hinzu, um PDFs zu finden.' : 'Keine Treffer'}
              </div>
            )}

            {!loading && ftResults === null && filtered.map(f => (
              <div key={f.path} className={`px-3 py-2 border-b last:border-0 ${isDark ? 'border-zinc-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <button onClick={() => openFile(f.path)}
                    className={`flex-1 min-w-0 text-left text-xs font-medium truncate ${isDark ? 'text-zinc-200 hover:text-clover-400' : 'text-gray-800 hover:text-clover-600'}`}
                    title={f.path}>
                    {f.name}
                  </button>
                  <span className={`text-[11px] flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{formatSize(f.size)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Tag size={11} className={isDark ? 'text-zinc-600' : 'text-gray-300'}/>
                  <input
                    value={tagDrafts[f.path] ?? (libraryTags[f.path] || []).join(', ')}
                    onChange={e => setTagDrafts(prev => ({ ...prev, [f.path]: e.target.value }))}
                    onBlur={() => commitTags(f.path)}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    placeholder="Tags, mit Komma getrennt"
                    className={`flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border outline-none focus:border-clover-500
                      ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300 placeholder-zinc-700' : 'bg-white border-gray-200 text-gray-600 placeholder-gray-300'}`}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
        <button onClick={closeLibrary}
          className={`px-4 py-1.5 rounded-lg text-sm ${isDark ? 'text-zinc-400 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`}>
          Schließen
        </button>
      </div>
    </Modal>
  )
}
