import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Trash2, AlignLeft, AlignRight, AlignStartVertical, AlignEndVertical, AlignCenterVertical, AlignCenterHorizontal, Layers } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { getAnnotationBounds } from '../lib/annotationBounds'
import { computeAlignDeltas } from '../lib/alignAnnotations'

const ALIGN_BUTTONS = [
  { edge: 'left',    Icon: AlignLeft,             label: 'Links ausrichten' },
  { edge: 'centerX', Icon: AlignCenterVertical,    label: 'Horizontal zentrieren' },
  { edge: 'right',   Icon: AlignRight,             label: 'Rechts ausrichten' },
  { edge: 'top',     Icon: AlignStartVertical,     label: 'Oben ausrichten' },
  { edge: 'centerY', Icon: AlignCenterHorizontal,  label: 'Vertikal zentrieren' },
  { edge: 'bottom',  Icon: AlignEndVertical,       label: 'Unten ausrichten' },
]

// Contextual floating toolbar for the current note/text/stamp selection
// (see selectedAnnotationIds in useStore.js). Anchored to the live union
// bounding box of the selected markers' own DOM nodes (via markerRefs, so it
// tracks drags) rather than a static trigger, unlike the toolbar dropdowns'
// useFloatingMenu (see FloatingMenu.jsx) - that's the deliberate deviation
// from that pattern this component needs.
export default function SelectionToolbar({ containerRef, markerRefs }) {
  const {
    theme, annotations, selectedAnnotationIds, removeAnnotations, duplicateAnnotations, updateAnnotationsBatch, openApplyStamp,
  } = useStore(useShallow(state => ({ theme: state.theme, annotations: state.annotations, selectedAnnotationIds: state.selectedAnnotationIds, removeAnnotations: state.removeAnnotations, duplicateAnnotations: state.duplicateAnnotations, updateAnnotationsBatch: state.updateAnnotationsBatch, openApplyStamp: state.openApplyStamp })))
  const isDark = theme === 'dark'

  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!selectedAnnotationIds.length) { setRect(null); return }
    const update = () => {
      const rects = selectedAnnotationIds
        .map(id => markerRefs.current.get(id)?.getBoundingClientRect())
        .filter(Boolean)
      if (!rects.length) { setRect(null); return }
      const left   = Math.min(...rects.map(r => r.left))
      const top    = Math.min(...rects.map(r => r.top))
      const right  = Math.max(...rects.map(r => r.right))
      setRect({ left, top, right })
    }
    update()
    const scrollEl = containerRef.current
    window.addEventListener('resize', update)
    scrollEl?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      scrollEl?.removeEventListener('scroll', update)
    }
    // Re-measure whenever the selection or any annotation's position changes
    // (e.g. mid-drag) so the toolbar keeps following the selected markers.
  }, [selectedAnnotationIds, annotations, containerRef, markerRefs])

  if (!rect || !selectedAnnotationIds.length) return null

  const selected = selectedAnnotationIds.map(id => annotations.find(a => a.id === id)).filter(Boolean)
  const canAlign = selected.length >= 2 && selected.every(a => a.page === selected[0].page)
  const singleStamp = selected.length === 1 && selected[0].type === 'stamp' ? selected[0] : null

  const align = (edge) => {
    const boundsList = selected.map(a => ({ id: a.id, ...getAnnotationBounds(a, markerRefs.current.get(a.id)) }))
    const deltas = computeAlignDeltas(boundsList, edge)
    updateAnnotationsBatch(deltas.map(d => {
      const a = selected.find(x => x.id === d.id)
      return { id: d.id, x: a.x + d.dx, y: a.y + d.dy }
    }))
  }

  const btnCls = `p-1.5 rounded transition-colors ${isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100'}`

  return createPortal(
    <div
      style={{ position: 'fixed', left: rect.left, top: Math.max(4, rect.top - 44), zIndex: 9999 }}
      className={`flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-lg border
        ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
      onMouseDown={(e) => e.stopPropagation()}>
      <button title="Duplizieren (Strg+D)" className={btnCls} onClick={() => duplicateAnnotations(selectedAnnotationIds)}>
        <Copy size={15}/>
      </button>
      <button title="Löschen (Entf)" className={btnCls} onClick={() => removeAnnotations(selectedAnnotationIds)}>
        <Trash2 size={15}/>
      </button>
      {singleStamp && (
        <>
          <div className={`w-px h-5 mx-0.5 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}/>
          <button title="Auf Seiten anwenden …" className={btnCls} onClick={() => openApplyStamp(singleStamp.id)}>
            <Layers size={15}/>
          </button>
        </>
      )}
      {canAlign && (
        <>
          <div className={`w-px h-5 mx-0.5 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}/>
          {ALIGN_BUTTONS.map(({ edge, Icon, label }) => (
            <button key={edge} title={label} className={btnCls} onClick={() => align(edge)}>
              <Icon size={15}/>
            </button>
          ))}
        </>
      )}
    </div>,
    document.body
  )
}
