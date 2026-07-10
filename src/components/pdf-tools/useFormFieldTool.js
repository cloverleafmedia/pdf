import { useRef } from 'react'
import { useStore } from '../../store/useStore'
import { defaultFieldName, dedupeFieldName, nextRadioOptionValue } from '../../lib/formFieldCreate'

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
      const { pendingFormFields, activeRadioGroupId, setActiveRadioGroupId } = useStore.getState()

      if (newFieldType === 'radio') {
        const groupMembers = pendingFormFields.filter(f => f.groupId === activeRadioGroupId)
        if (activeRadioGroupId && groupMembers.length) {
          // Joining the group this session already started - reuse its name.
          const optionValue = nextRadioOptionValue(groupMembers.map(f => f.optionValue))
          // Required is a property of the group's one pdf-lib field, not each
          // individual widget - a later button joining the group inherits
          // whatever the group's first member already has, so the toggle
          // (which only ever shows on that first member, see DraggableFieldBox)
          // doesn't silently stop applying once a second option is added.
          addFormFieldDraft({ pageNum, type: 'radio', name: groupMembers[0].name, groupId: activeRadioGroupId, optionValue, required: groupMembers[0].required, x, y, w, h, logicalW: size.w, logicalH: size.h })
        } else {
          // First button of a fresh group - mint both a new name and a new groupId.
          const existingNames = pendingFormFields.map(f => f.name)
          const groupCount = new Set(pendingFormFields.filter(f => f.type === 'radio').map(f => f.groupId)).size
          const name = dedupeFieldName(defaultFieldName('radio', groupCount + 1), existingNames)
          const groupId = `radio-${Date.now()}-${Math.random()}`
          const optionValue = nextRadioOptionValue([])
          addFormFieldDraft({ pageNum, type: 'radio', name, groupId, optionValue, required: false, x, y, w, h, logicalW: size.w, logicalH: size.h })
          setActiveRadioGroupId(groupId)
        }
      } else {
        const existingNames = pendingFormFields.map(f => f.name)
        const n = pendingFormFields.filter(f => f.type === newFieldType).length + 1
        const name = dedupeFieldName(defaultFieldName(newFieldType, n), existingNames)
        const options = ['dropdown', 'listbox'].includes(newFieldType) ? [] : undefined
        // Appearance defaults - only ever read/edited for type 'text' (see
        // the properties panel in DraggableFieldBox), but harmless to carry
        // on every type since annotationFlatten.js only applies them there.
        addFormFieldDraft({ pageNum, type: newFieldType, name, x, y, w, h, logicalW: size.w, logicalH: size.h, options, required: false, alignment: 'left', multiline: false, defaultValue: '', fontSize: undefined })
      }
    }
    rectStartRef.current = null
    redraw()
  }

  return { onMouseDown, onMouseMove, onMouseUp }
}
