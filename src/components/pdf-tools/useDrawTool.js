import { useRef } from 'react'

// Freehand drawing - the fallback tool once eraser/note/text/redact/newfield/
// shape have all been ruled out by the dispatcher in PDFViewer.jsx.
export function useDrawTool({ pageNum, size, getPos, overlayRef, redraw, drawColor, drawWidth, addAnnotation }) {
  const drawingRef = useRef(false)
  const pathRef = useRef([])

  const onMouseDown = (e) => {
    drawingRef.current = true
    pathRef.current = [getPos(e)]
  }

  const onMouseMove = (e) => {
    if (!drawingRef.current) return
    const pos = getPos(e)
    pathRef.current.push(pos)
    redraw()

    const dpr = window.devicePixelRatio || 1
    const ctx = overlayRef.current.getContext('2d')
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const path = pathRef.current
    ctx.globalAlpha  = 1
    ctx.strokeStyle  = drawColor
    ctx.lineWidth    = drawWidth
    ctx.lineCap      = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
    ctx.stroke()
    ctx.restore()
  }

  const onMouseUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (pathRef.current.length > 1)
      addAnnotation({ type: 'draw', page: pageNum, path: [...pathRef.current], color: drawColor, width: drawWidth, pageW: size.w, pageH: size.h })
    pathRef.current = []
  }

  return { onMouseDown, onMouseMove, onMouseUp }
}
