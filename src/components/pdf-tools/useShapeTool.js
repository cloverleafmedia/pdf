import { useRef } from 'react'
import { SHAPE_STROKE } from './constants'

// Handles both gestures the 'shape' tool can draw: rectangle/circle via
// click-drag, or an arrow via a 2-click gesture (first click sets the start
// point, second click commits - no drag between them).
export function useShapeTool({ pageNum, size, getPos, overlayRef, redraw, shapeType, drawColor, drawWidth, addAnnotation }) {
  const rectStartRef = useRef(null)
  const arrowStartRef = useRef(null) // first click of the 2-click arrow gesture

  const onMouseDown = (e) => {
    const pos = getPos(e)
    if (shapeType === 'arrow') {
      if (!arrowStartRef.current) {
        arrowStartRef.current = pos
      } else {
        const s = arrowStartRef.current
        if (Math.hypot(pos.x - s.x, pos.y - s.y) > 5)
          addAnnotation({ type: 'arrow', page: pageNum, x1: s.x, y1: s.y, x2: pos.x, y2: pos.y, color: drawColor, width: drawWidth, pageW: size.w, pageH: size.h })
        arrowStartRef.current = null
        redraw()
      }
      return
    }
    rectStartRef.current = pos
  }

  const onMouseMove = (e) => {
    // Arrow's 2-click gesture: live preview line even though there's no drag
    // between the two clicks.
    if (shapeType === 'arrow' && arrowStartRef.current) {
      const pos = getPos(e)
      redraw()
      const dpr = window.devicePixelRatio || 1
      const ctx = overlayRef.current.getContext('2d')
      const s = arrowStartRef.current
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = SHAPE_STROKE; ctx.lineWidth = drawWidth || 2
      ctx.setLineDash([6, 3]); ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.restore()
      return
    }

    if (!rectStartRef.current) return
    const pos = getPos(e)
    redraw()
    const dpr = window.devicePixelRatio || 1
    const ctx = overlayRef.current.getContext('2d')
    const s = rectStartRef.current
    const w = pos.x - s.x, h = pos.y - s.y
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = SHAPE_STROKE
    ctx.lineWidth = 2; ctx.setLineDash([6, 3])
    if (shapeType === 'rectangle') {
      ctx.strokeRect(s.x, s.y, w, h)
    } else {
      ctx.beginPath()
      ctx.ellipse(s.x + w / 2, s.y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  const onMouseUp = (e) => {
    // Arrow commits on its second mousedown - nothing to do on mouseup.
    if (shapeType === 'arrow') return
    if (!rectStartRef.current) return
    const pos = getPos(e)
    const s = rectStartRef.current
    const x = Math.min(s.x, pos.x), y = Math.min(s.y, pos.y)
    const w = Math.abs(pos.x - s.x), h = Math.abs(pos.y - s.y)
    if (w > 5 && h > 5) addAnnotation({ type: shapeType, page: pageNum, x, y, w, h, color: drawColor, width: drawWidth, pageW: size.w, pageH: size.h })
    rectStartRef.current = null
    redraw()
  }

  return { onMouseDown, onMouseMove, onMouseUp }
}
