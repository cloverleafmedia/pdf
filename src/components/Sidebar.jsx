import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, BookOpen, FileText, MessageSquare, ChevronRight, ChevronDown, X, GripVertical, Trash2, Copy, FilePlus, Plus, BookmarkCheck } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../store/useStore'
import { reorderPages, deletePage as deletePageOp, duplicatePage as duplicatePageOp, insertBlankPageAfter } from '../lib/pdfPageOps'
import { navigateToPage } from '../lib/navigate'

// Fixed thumbnail render width — also used to pre-compute placeholder height
// (see ThumbPage) so the reserved space matches what renderThumb() ends up
// producing exactly, instead of a `w-full` guess that's usually wider.
const THUMB_W = 200

export default function Sidebar() {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab, theme } = useStore()
  const isDark = theme === 'dark'

  const tabs = [
    { id: 'thumbnails',  icon: <FileText size={15}/>,       label: t('sidebar.thumbnails') },
    { id: 'bookmarks',   icon: <BookOpen size={15}/>,       label: t('sidebar.bookmarks') },
    { id: 'search',      icon: <Search size={15}/>,         label: t('sidebar.search') },
    { id: 'annotations', icon: <MessageSquare size={15}/>,  label: t('sidebar.annotations') },
  ]

  return (
    <div className={`flex flex-col h-full border-r
      ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>

      <div className={`flex flex-shrink-0 border-b ${isDark ? 'border-zinc-800' : 'border-gray-200'}`}>
        {tabs.map(tab => (
          <button key={tab.id} title={tab.label} onClick={() => setSidebarTab(tab.id)}
            className={`flex-1 flex flex-col items-center py-2.5 transition-colors
              ${sidebarTab === tab.id
                ? 'text-clover-400 border-b-2 border-clover-500'
                : isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'
              }`}>
            {tab.icon}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {sidebarTab === 'thumbnails'  && <Thumbnails isDark={isDark} />}
        {sidebarTab === 'bookmarks'   && <Bookmarks isDark={isDark} />}
        {sidebarTab === 'search'      && <SearchPanel isDark={isDark} />}
        {sidebarTab === 'annotations' && <AnnotationsList isDark={isDark} />}
      </div>
    </div>
  )
}

// ── Thumbnails with drag-to-reorder ───────────────────────────────────────
function Thumbnails({ isDark }) {
  const { pdfDoc, pdfBytes, filePath, fileName, fileSize, currentPage, pageRotations, openDocument, setStatus } = useStore()
  const [order, setOrder] = useState([])
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (pdfDoc) setOrder(Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1))
  }, [pdfDoc])

  // Base page size (at scale 1), used to reserve the correct thumbnail height
  // up front — see baseSize usage in ThumbPage for why this matters.
  const [baseSize, setBaseSize] = useState(null)
  useEffect(() => {
    if (!pdfDoc) { setBaseSize(null); return }
    pdfDoc.getPage(1).then(page => {
      const vp = page.getViewport({ scale: 1 })
      setBaseSize({ width: vp.width, height: vp.height })
    }).catch(() => {})
  }, [pdfDoc])

  // Keep the active thumbnail in view as the user scrolls the main PDF area —
  // previously this only worked in the other direction (click thumbnail → main
  // view scrolls), so the sidebar visibly fell behind during normal reading.
  useEffect(() => {
    if (dragFrom) return // don't fight the user mid-drag-reorder
    // Wait a frame so the aspect-ratio-reserved layout above has settled
    // before measuring/scrolling — otherwise a scroll started mid-layout can
    // still land slightly short/long of its target.
    const raf = requestAnimationFrame(() => {
      document.getElementById(`thumb-${currentPage}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [currentPage, dragFrom])

  const scrollToPage = (n) => navigateToPage(n)

  // getDocument() transfers/detaches the buffer it's given — pass a copy.
  const reloadDocument = async (bytes) => {
    const reloaded = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    openDocument(reloaded, bytes, filePath, fileName, bytes.byteLength)
  }

  const reorder = useCallback(async (fromPage, toPage) => {
    try {
      setStatus('Seiten werden umsortiert …')
      const result = await reorderPages(pdfBytes, order, fromPage, toPage)
      if (!result) return
      await reloadDocument(result.bytes)
      setOrder(result.newOrder)
      setStatus('Sortierung gespeichert')
    } catch (e) { setStatus('Fehler: ' + e.message) }
  }, [order, pdfBytes, filePath, fileName])

  const deletePage = useCallback(async (pageNum) => {
    if (order.length <= 1) { setStatus('Letzte Seite kann nicht gelöscht werden'); return }
    try {
      setStatus('Seite wird gelöscht …')
      const { bytes } = await deletePageOp(pdfBytes, order, pageNum)
      await reloadDocument(bytes)
      setStatus('Seite gelöscht')
    } catch (e) { setStatus('Fehler: ' + e.message) }
  }, [order, pdfBytes, filePath, fileName])

  const duplicatePage = useCallback(async (pageNum) => {
    try {
      setStatus('Seite wird dupliziert …')
      const { bytes } = await duplicatePageOp(pdfBytes, order, pageNum)
      await reloadDocument(bytes)
      setStatus('Seite dupliziert')
    } catch (e) { setStatus('Fehler: ' + e.message) }
  }, [order, pdfBytes, filePath, fileName])

  const insertBlankAfter = useCallback(async (pageNum) => {
    try {
      setStatus('Leere Seite wird eingefügt …')
      const { bytes } = await insertBlankPageAfter(pdfBytes, order, pageNum)
      await reloadDocument(bytes)
      setStatus('Leere Seite eingefügt')
    } catch (e) { setStatus('Fehler: ' + e.message) }
  }, [order, pdfBytes, filePath, fileName])

  if (!pdfDoc) return <Empty isDark={isDark} />

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-2 space-y-1.5">
      {order.map(n => (
        <ThumbPage
          key={`${n}-${pageRotations[n] || 0}`}
          pageNum={n}
          isActive={n === currentPage}
          isDark={isDark}
          onClick={() => scrollToPage(n)}
          rotation={pageRotations[n] || 0}
          baseSize={baseSize}
          isDragOver={dragOver === n}
          onDragStart={() => setDragFrom(n)}
          onDragOver={setDragOver}
          onDragEnd={() => { if (dragFrom && dragOver && dragFrom !== dragOver) reorder(dragFrom, dragOver); setDragFrom(null); setDragOver(null) }}
          onDelete={() => deletePage(n)}
          onDuplicate={() => duplicatePage(n)}
          onInsertBlank={() => insertBlankAfter(n)}
        />
      ))}
    </div>
  )
}

function ThumbPage({ pageNum, isActive, isDark, onClick, rotation, baseSize, isDragOver, onDragStart, onDragOver, onDragEnd, onDelete, onDuplicate, onInsertBlank }) {
  const { pdfDoc } = useStore()
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const rendered  = useRef(false)
  const renderRef = useRef(null)
  // Once true, we stop touching the canvas's inline style from React entirely
  // (see placeholderH below) so renderThumb()'s direct DOM writes aren't
  // clobbered by a later re-render of this component.
  const [isRendered, setIsRendered] = useState(false)

  useEffect(() => {
    rendered.current = false
    setIsRendered(false)
    if (renderRef.current) { renderRef.current.cancel?.(); renderRef.current = null }
  }, [pdfDoc, rotation])

  // Reserve the canvas's final height up front (before it actually renders,
  // which happens lazily/async) — otherwise every not-yet-rendered thumbnail
  // sits at the browser's default <canvas> height, the sidebar's scrollHeight
  // keeps growing as thumbnails pop in, and any in-flight scrollIntoView()
  // (see the auto-scroll effect in Thumbnails) lands short of its target
  // because the layout shifted mid-scroll.
  // Must match renderThumb()'s own math exactly (fixed THUMB_W, same rotation
  // swap) — the width here is a hard pixel value, not `w-full`, because
  // renderThumb() sets canvas.style.width to a fixed THUMB_W too.
  const aspect = baseSize
    ? (rotation === 90 || rotation === 270 ? baseSize.height / baseSize.width : baseSize.width / baseSize.height)
    : 0.77
  const placeholderH = Math.round(THUMB_W / aspect)

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !rendered.current && pdfDoc) {
        rendered.current = true
        renderThumb(pageNum, canvasRef.current, pdfDoc, rotation, renderRef).then(() => setIsRendered(true))
      }
    }, { rootMargin: '400px' })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [pdfDoc, pageNum, rotation])

  return (
    <div ref={wrapRef}
      id={`thumb-${pageNum}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); onDragOver(pageNum) }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-md overflow-hidden transition-all duration-150
        ${isActive  ? 'ring-2 ring-clover-500 shadow-clover-900/30 shadow-lg' : ''}
        ${isDragOver ? 'ring-2 ring-blue-400 scale-[1.02]' : ''}
        ${!isActive && !isDragOver ? isDark ? 'ring-1 ring-zinc-700 hover:ring-zinc-500' : 'ring-1 ring-gray-200 hover:ring-gray-400' : ''}`}>

      {/* Drag handle */}
      <div className={`absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-60 transition-opacity
        ${isDark ? 'text-zinc-300' : 'text-gray-400'}`}>
        <GripVertical size={12}/>
      </div>

      {/* Page action buttons */}
      <div className="absolute top-1 right-1 z-10 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button title="Leere Seite darunter einfügen"
          onClick={e => { e.stopPropagation(); onInsertBlank() }}
          className="w-5 h-5 flex items-center justify-center rounded bg-zinc-700/90 hover:bg-zinc-500 text-white shadow">
          <FilePlus size={10}/>
        </button>
        <button title="Seite duplizieren"
          onClick={e => { e.stopPropagation(); onDuplicate() }}
          className="w-5 h-5 flex items-center justify-center rounded bg-zinc-700/90 hover:bg-zinc-500 text-white shadow">
          <Copy size={10}/>
        </button>
        <button title="Seite löschen"
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="w-5 h-5 flex items-center justify-center rounded bg-red-700/80 hover:bg-red-600 text-white shadow">
          <Trash2 size={10}/>
        </button>
      </div>

      <canvas ref={canvasRef} className="w-full block" style={isRendered ? undefined : { height: placeholderH }} />

      <div className={`text-center text-[10px] py-0.5
        ${isActive
          ? 'bg-clover-600 text-white'
          : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-50 text-gray-400'
        }`}>
        {pageNum}
      </div>
    </div>
  )
}

async function renderThumb(pageNum, canvas, pdfDoc, rotation, renderRef) {
  if (!canvas || !pdfDoc) return
  try {
    const page = await pdfDoc.getPage(pageNum)
    const dpr   = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (THUMB_W / page.getViewport({ scale: 1 }).width) * dpr

    const vp = page.getViewport({ scale, rotation })
    canvas.width  = vp.width
    canvas.height = vp.height
    canvas.style.width  = (vp.width  / dpr) + 'px'
    canvas.style.height = (vp.height / dpr) + 'px'

    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
    renderRef.current = task
    await task.promise
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') console.warn('Thumb render:', e)
  }
}

// ── Bookmarks ──────────────────────────────────────────────────────────────
function Bookmarks({ isDark }) {
  const { pdfDoc, currentPage, filePath } = useStore()
  const [outline,   setOutline]   = useState(null)
  const [userMarks, setUserMarks] = useState([])  // [{page, label}]
  const [adding,    setAdding]    = useState(false)
  const [newLabel,  setNewLabel]  = useState('')

  // Load PDF native outline
  useEffect(() => {
    if (!pdfDoc) return
    pdfDoc.getOutline().then(o => setOutline(o || [])).catch(() => setOutline([]))
  }, [pdfDoc])

  // Persist user bookmarks per file in localStorage
  const storageKey = filePath ? 'bm_' + encodeURIComponent(filePath) : null

  useEffect(() => {
    if (!storageKey) return
    try { setUserMarks(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { setUserMarks([]) }
  }, [storageKey])

  const saveMarks = (marks) => {
    setUserMarks(marks)
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(marks))
  }

  const addMark = () => {
    const label = newLabel.trim() || `Seite ${currentPage}`
    const marks = [...userMarks.filter(m => m.page !== currentPage), { page: currentPage, label }]
      .sort((a, b) => a.page - b.page)
    saveMarks(marks)
    setAdding(false); setNewLabel('')
  }

  const deleteMark = (page) => saveMarks(userMarks.filter(m => m.page !== page))

  const goTo = (n) => navigateToPage(n)

  if (!pdfDoc) return <Empty isDark={isDark} />

  return (
    <div className="flex flex-col h-full">
      {/* Add bookmark toolbar */}
      <div className={`p-2 border-b flex-shrink-0 ${isDark ? 'border-zinc-800' : 'border-gray-200'}`}>
        {adding ? (
          <div className="flex gap-1">
            <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMark(); if (e.key === 'Escape') setAdding(false) }}
              placeholder={`Seite ${currentPage} …`}
              className={`flex-1 px-2 py-1 text-xs rounded border outline-none focus:border-clover-500
                ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900'}`} />
            <button onClick={addMark} className="px-2 py-1 text-xs bg-clover-600 text-white rounded">✓</button>
            <button onClick={() => setAdding(false)} className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors
              ${isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
            <Plus size={12}/> Lesezeichen für Seite {currentPage} hinzufügen
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* User-defined bookmarks */}
        {userMarks.length > 0 && (
          <>
            <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
              Eigene Lesezeichen
            </div>
            {userMarks.map(m => (
              <div key={m.page}
                className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer group text-xs
                  ${isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}
                onClick={() => goTo(m.page)}>
                <BookmarkCheck size={12} className="text-clover-400 flex-shrink-0"/>
                <span className="flex-1 truncate">{m.label}</span>
                <span className={`text-[10px] flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>S.{m.page}</span>
                <button onClick={e => { e.stopPropagation(); deleteMark(m.page) }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 ml-1 flex-shrink-0">
                  <X size={10}/>
                </button>
              </div>
            ))}
          </>
        )}

        {/* PDF native outline */}
        {outline === null && (
          <div className={`p-4 text-xs animate-pulse ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Lade …</div>
        )}
        {outline !== null && outline.length > 0 && (
          <>
            <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
              Dokument-Gliederung
            </div>
            {outline.map((item, i) => <OutlineItem key={i} item={item} isDark={isDark} depth={0} />)}
          </>
        )}
        {outline !== null && outline.length === 0 && userMarks.length === 0 && (
          <div className={`p-4 text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Keine Lesezeichen vorhanden</div>
        )}
      </div>
    </div>
  )
}

function OutlineItem({ item, isDark, depth }) {
  const { pdfDoc } = useStore()
  const [open, setOpen] = useState(depth < 1)

  const navigate = async () => {
    if (!item.dest) return
    try {
      let dest = item.dest
      if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest)
      if (!Array.isArray(dest) || !dest[0]) return
      const pageIndex = await pdfDoc.getPageIndex(dest[0])
      navigateToPage(pageIndex + 1)
    } catch (_) {}
  }

  const hasChildren = item.items?.length > 0
  return (
    <div style={{ paddingLeft: depth * 10 }}>
      <div className={`flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer text-xs
        ${isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
        {hasChildren
          ? <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
              className={isDark ? 'text-zinc-500' : 'text-gray-400'}>
              {open ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
            </button>
          : <span className="w-3" />
        }
        <span onClick={navigate} className="flex-1 truncate leading-4">{item.title}</span>
      </div>
      {open && hasChildren && item.items.map((child, i) => (
        <OutlineItem key={i} item={child} isDark={isDark} depth={depth + 1} />
      ))}
    </div>
  )
}

// ── Search ─────────────────────────────────────────────────────────────────
function SearchPanel({ isDark }) {
  const { t } = useTranslation()
  const { pdfDoc, totalPages, searchQuery, searchResults, searchIndex, searchCase,
          setSearchQuery, setSearchResults, setSearchIndex, setSearchCase } = useStore()
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) { setSearchResults([]); return }
    setLoading(true)
    const results = []
    const q = searchCase ? searchQuery : searchQuery.toLowerCase()
    for (let p = 1; p <= totalPages; p++) {
      try {
        const page    = await pdfDoc.getPage(p)
        const content = await page.getTextContent()
        const text    = content.items.map(i => i.str).join(' ')
        const hay     = searchCase ? text : text.toLowerCase()
        let idx = hay.indexOf(q)
        while (idx !== -1) {
          results.push({ page: p, text: text.slice(Math.max(0, idx - 30), idx + q.length + 50).trim() })
          idx = hay.indexOf(q, idx + 1)
        }
      } catch (_) {}
    }
    setSearchResults(results)
    setLoading(false)
  }, [pdfDoc, searchQuery, searchCase, totalPages])

  useEffect(() => {
    const t = setTimeout(doSearch, 450)
    return () => clearTimeout(t)
  }, [doSearch])

  const goTo = (r, i) => {
    setSearchIndex(i)
    navigateToPage(r.page)
  }

  if (!pdfDoc) return <Empty isDark={isDark} />

  return (
    <div className="flex flex-col h-full">
      <div className={`p-2 space-y-2 border-b flex-shrink-0 ${isDark ? 'border-zinc-800' : 'border-gray-200'}`}>
        <div className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 border
          ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-300'}`}>
          <Search size={13} className={isDark ? 'text-zinc-500' : 'text-gray-400'} />
          <input ref={inputRef}
            className={`flex-1 text-xs bg-transparent outline-none
              ${isDark ? 'text-zinc-100 placeholder-zinc-600' : 'text-gray-900 placeholder-gray-400'}`}
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}>
              <X size={12} className={isDark ? 'text-zinc-500' : 'text-gray-400'} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <CBtn label="Aa" active={searchCase} onClick={() => setSearchCase(!searchCase)} isDark={isDark} title={t('search.caseSensitive')} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className={`px-3 py-2 text-xs animate-pulse ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Suche läuft …</div>
        )}
        {!loading && searchQuery && !loading && searchResults.length === 0 && (
          <div className={`px-3 py-3 text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{t('search.noResults')}</div>
        )}
        {!loading && searchResults.length > 0 && (
          <>
            <div className={`px-3 py-1.5 text-[10px] font-medium ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              {searchResults.length} Treffer
            </div>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => goTo(r, i)}
                className={`w-full text-left px-3 py-2 text-xs border-b transition-colors
                  ${i === searchIndex
                    ? isDark ? 'bg-clover-900/40 border-clover-800/50' : 'bg-clover-50 border-clover-100'
                    : isDark ? 'hover:bg-zinc-800 border-zinc-800' : 'hover:bg-gray-50 border-gray-100'
                  }`}>
                <div className={`font-semibold mb-0.5 ${isDark ? 'text-clover-400' : 'text-clover-600'}`}>S. {r.page}</div>
                <div className={`truncate leading-relaxed ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>…{r.text}…</div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Annotations list ───────────────────────────────────────────────────────
function AnnotationsList({ isDark }) {
  const { annotations, removeAnnotation, addReply, deleteReply } = useStore()
  const ICONS = { highlight: '🟡', note: '📌', text: '📝', draw: '✏️', underline: '▁', strikethrough: '—' }
  const [expanded, setExpanded] = useState({})
  const [drafts,   setDrafts]   = useState({})

  if (!annotations.length)
    return <div className={`p-4 text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Noch keine Anmerkungen</div>

  const submitReply = (id) => {
    const text = (drafts[id] || '').trim()
    if (!text) return
    addReply(id, text)
    setDrafts(d => ({ ...d, [id]: '' }))
  }

  return (
    <div className="h-full overflow-y-auto p-2 space-y-1">
      {annotations.map(a => {
        const replies = a.replies || []
        const isOpen  = !!expanded[a.id]
        return (
          <div key={a.id} className={`rounded-lg text-xs ${isDark ? 'bg-zinc-800/60' : 'bg-gray-50'}`}>
            <div onClick={() => navigateToPage(a.page, { setPage: false })}
              className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer group transition-colors
                ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100'}`}>
              <span className="text-base flex-shrink-0 mt-0.5">{ICONS[a.type] || '📎'}</span>
              <div className="flex-1 min-w-0">
                <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>S. {a.page}</span>
                {a.text && <div className={`truncate mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{a.text}</div>}
              </div>
              <button onClick={e => { e.stopPropagation(); setExpanded(x => ({ ...x, [a.id]: !x[a.id] })) }}
                title={replies.length ? `${replies.length} Antwort(en)` : 'Antworten'}
                className={`flex items-center gap-0.5 px-1 flex-shrink-0 transition-colors
                  ${isOpen || replies.length ? 'text-clover-500' : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'}`}>
                <MessageSquare size={11}/>
                {replies.length > 0 && <span className="text-[10px]">{replies.length}</span>}
              </button>
              <button onClick={e => { e.stopPropagation(); removeAnnotation(a.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity flex-shrink-0">
                <X size={12}/>
              </button>
            </div>

            {isOpen && (
              <div className={`px-2 pb-2 pl-8 space-y-1.5 border-t ${isDark ? 'border-zinc-700/60' : 'border-gray-200'}`}
                onClick={e => e.stopPropagation()}>
                {replies.map(r => (
                  <div key={r.id} className={`group/reply flex items-start gap-1.5 rounded px-2 py-1 mt-1.5
                    ${isDark ? 'bg-zinc-900/50' : 'bg-white'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={isDark ? 'text-zinc-300' : 'text-gray-700'}>{r.text}</div>
                      <div className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                        {new Date(r.time).toLocaleString('de-DE')}
                      </div>
                    </div>
                    <button onClick={() => deleteReply(a.id, r.id)}
                      className="opacity-0 group-hover/reply:opacity-100 text-red-400 hover:text-red-300 transition-opacity flex-shrink-0">
                      <X size={10}/>
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1 pt-1">
                  <input value={drafts[a.id] || ''} onChange={e => setDrafts(d => ({ ...d, [a.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') submitReply(a.id) }}
                    placeholder="Antworten …"
                    className={`flex-1 px-2 py-1 rounded text-xs outline-none border
                      ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}/>
                  <button onClick={() => submitReply(a.id)}
                    className="px-2 py-1 rounded text-xs bg-clover-600 hover:bg-clover-700 text-white transition-colors flex-shrink-0">
                    ↵
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CBtn({ label, active, onClick, isDark, title }) {
  return (
    <button title={title} onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors
        ${active
          ? 'bg-clover-600 text-white'
          : isDark ? 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}>
      {label}
    </button>
  )
}

function Empty({ isDark }) {
  return <div className={`p-4 text-xs ${isDark ? 'text-zinc-700' : 'text-gray-300'}`}>Kein Dokument geöffnet</div>
}
