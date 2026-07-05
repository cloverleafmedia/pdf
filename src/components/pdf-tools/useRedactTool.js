import { useRef } from 'react'
import { REDACTION_FILL } from './constants'

export function useRedactTool({ pageNum, size, getPos, overlayRef, redraw, addRedaction }) {
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
    ctx.fillStyle = REDACTION_FILL; ctx.strokeStyle = '#ef4444'
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
    if (w > 5 && h > 5) addRedaction({ pageNum, x, y, w, h, logicalW: size.w, logicalH: size.h })
    rectStartRef.current = null
    redraw()
  }

  return { onMouseDown, onMouseMove, onMouseUp }
}
