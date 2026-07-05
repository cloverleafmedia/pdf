import { useRef } from 'react'
import { useStore } from '../../store/useStore'
import { defaultFieldName, dedupeFieldName } from '../../lib/formFieldCreate'

// Live-drag preview for placing a new form field - blue, distinct from
// redaction's red, so the two drag-tools are visually distinguishable.
export const NEW_FIELD_FILL = 'rgba(59,130,246,0.25)'

export function useFormFieldTool({ pageNum, size, getPos, overlayRef, redraw, newFieldType, addFormFieldDraft }) {
  const rectStartRef = useRef(null)

  const onMouseDown = (e) => {
    rectStartRef.current = getPos(e)
  }

  const onMouseMove = (e) => {
    if (!rectStartRef.current) return
    const pos = getPos(e)
    redraw()
    const dpr = window.devicePixelRatio || 1
    const ctx = overlayRef.current.getContext('2d')
    const s = rectStartRef.current
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = NEW_FIELD_FILL; ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2; ctx.setLineDash([6, 3])
    ctx.fillRect(s.x, s.y, pos.x - s.x, pos.y - s.y)
    ctx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y)
    ctx.restore()
  }

  const onMouseUp = (e) => {
    if (!rectStartRef.current) return
    const pos = getPos(e)
    const s = rectStartRef.current
    const x = Math.min(s.x, pos.x), y = Math.min(s.y, pos.y)
    const w = Math.abs(pos.x - s.x), h = Math.abs(pos.y - s.y)
    if (w > 10 && h > 10) {
      const existingNames = useStore.getState().pendingFormFields.map(f => f.name)
      const n = useStore.getState().pendingFormFields.filter(f => f.type === newFieldType).length + 1
      const name = dedupeFieldName(defaultFieldName(newFieldType, n), existingNames)
      addFormFieldDraft({ pageNum, type: newFieldType, name, x, y, w, h, logicalW: size.w, logicalH: size.h })
    }
    rectStartRef.current = null
    redraw()
  }

  return { onMouseDown, onMouseMove, onMouseUp }
}
