import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// useStore.js calls `window.api?.saveSettings(...)` inline in several actions.
// Referencing the bare `window` global throws in plain Node (unlike jsdom),
// regardless of the optional-chaining on `.api` - so a minimal stub is needed
// before the store module is ever imported.
globalThis.window = { api: { saveSettings: () => {}, saveRecent: () => {} } }

const { useStore } = await import('./useStore.js')

const initialState = useStore.getState()
beforeEach(() => {
  useStore.setState(initialState, true)
})

function fakePdfDoc(numPages) {
  return { numPages }
}

describe('annotation undo/redo stack', () => {
  it('adds an annotation and makes it undoable', () => {
    useStore.getState().addAnnotation({ type: 'highlight', page: 1 })
    expect(useStore.getState().annotations).toHaveLength(1)

    useStore.getState().undoAnnotation()
    expect(useStore.getState().annotations).toHaveLength(0)

    useStore.getState().redoAnnotation()
    expect(useStore.getState().annotations).toHaveLength(1)
  })

  it('clears the redo (future) stack once a new annotation is added after an undo', () => {
    useStore.getState().addAnnotation({ type: 'highlight', page: 1 })
    useStore.getState().undoAnnotation()
    expect(useStore.getState().annotationFuture).toHaveLength(1)

    useStore.getState().addAnnotation({ type: 'note', page: 1 })
    expect(useStore.getState().annotationFuture).toHaveLength(0)
  })

  it('is a no-op when there is nothing to undo or redo', () => {
    useStore.getState().undoAnnotation()
    expect(useStore.getState().annotations).toHaveLength(0)
    useStore.getState().redoAnnotation()
    expect(useStore.getState().annotations).toHaveLength(0)
  })

  it('caps annotationHistory at 30 entries', () => {
    for (let i = 0; i < 40; i++) {
      useStore.getState().addAnnotation({ type: 'highlight', page: 1, n: i })
    }
    expect(useStore.getState().annotationHistory.length).toBe(30)
    // oldest entries should have been dropped, not the newest
    expect(useStore.getState().annotations).toHaveLength(40)
  })

  it('removeAnnotation removes by id and is undoable too', () => {
    useStore.getState().addAnnotation({ type: 'highlight', page: 1 })
    const id = useStore.getState().annotations[0].id
    useStore.getState().removeAnnotation(id)
    expect(useStore.getState().annotations).toHaveLength(0)

    useStore.getState().undoAnnotation()
    expect(useStore.getState().annotations).toHaveLength(1)
  })
})

describe('reply threads are excluded from undo/redo', () => {
  it('addReply/deleteReply do not push onto annotationHistory', () => {
    useStore.getState().addAnnotation({ type: 'note', page: 1 })
    const id = useStore.getState().annotations[0].id
    const historyLengthAfterAdd = useStore.getState().annotationHistory.length

    useStore.getState().addReply(id, 'a comment')
    expect(useStore.getState().annotationHistory.length).toBe(historyLengthAfterAdd)
    expect(useStore.getState().annotations[0].replies).toHaveLength(1)

    const replyId = useStore.getState().annotations[0].replies[0].id
    useStore.getState().deleteReply(id, replyId)
    expect(useStore.getState().annotationHistory.length).toBe(historyLengthAfterAdd)
    expect(useStore.getState().annotations[0].replies).toHaveLength(0)
  })
})

describe('zoom clamping', () => {
  it('setZoom clamps to [10, 500]', () => {
    useStore.getState().setZoom(5)
    expect(useStore.getState().zoom).toBe(10)
    useStore.getState().setZoom(9999)
    expect(useStore.getState().zoom).toBe(500)
    useStore.getState().setZoom(150)
    expect(useStore.getState().zoom).toBe(150)
  })

  it('zoomIn/zoomOut step by 10 and clamp at the same bounds', () => {
    useStore.setState({ zoom: 495 })
    useStore.getState().zoomIn()
    expect(useStore.getState().zoom).toBe(500)

    useStore.setState({ zoom: 15 })
    useStore.getState().zoomOut()
    expect(useStore.getState().zoom).toBe(10)
  })
})

describe('page rotation', () => {
  it('rotates right in +90 steps, wrapping at 360', () => {
    useStore.getState().rotatePageRight(1)
    expect(useStore.getState().pageRotations[1]).toBe(90)
    useStore.getState().rotatePageRight(1)
    useStore.getState().rotatePageRight(1)
    useStore.getState().rotatePageRight(1)
    expect(useStore.getState().pageRotations[1]).toBe(0)
  })

  it('rotates left in -90 steps without going negative', () => {
    useStore.getState().rotatePageLeft(1)
    expect(useStore.getState().pageRotations[1]).toBe(270)
  })

  it('tracks rotation per page independently', () => {
    useStore.getState().rotatePageRight(1)
    useStore.getState().rotatePageLeft(2)
    expect(useStore.getState().pageRotations[1]).toBe(90)
    expect(useStore.getState().pageRotations[2]).toBe(270)
  })
})

describe('setActiveTool', () => {
  it('updates lastAnnotateTool when switching to an annotate tool', () => {
    useStore.getState().setActiveTool('underline')
    expect(useStore.getState().activeTool).toBe('underline')
    expect(useStore.getState().lastAnnotateTool).toBe('underline')
  })

  it('leaves lastAnnotateTool unchanged when switching to a non-annotate tool', () => {
    useStore.getState().setActiveTool('underline')
    useStore.getState().setActiveTool('hand')
    expect(useStore.getState().activeTool).toBe('hand')
    expect(useStore.getState().lastAnnotateTool).toBe('underline')
  })
})

describe('tab management', () => {
  // Tab IDs are generated as `'tab-' + Date.now()`, so real wall-clock time
  // could produce two IDs in the same millisecond and collide. Fake timers,
  // advanced between every ID-generating call, make that deterministic.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('openTab snapshots the current document into tabs[] and switches to a fresh one', () => {
    useStore.getState().openDocument(fakePdfDoc(3), new Uint8Array([1]), 'a.pdf', 'a.pdf', 10)
    const firstTabId = useStore.getState().activeTabId
    useStore.getState().setCurrentPage(2)

    vi.advanceTimersByTime(10)
    useStore.getState().openTab(fakePdfDoc(5), new Uint8Array([2]), 'b.pdf', 'b.pdf', 20)
    expect(useStore.getState().tabs).toHaveLength(1)
    expect(useStore.getState().tabs[0].id).toBe(firstTabId)
    expect(useStore.getState().tabs[0].currentPage).toBe(2)
    expect(useStore.getState().fileName).toBe('b.pdf')
    expect(useStore.getState().activeTabId).not.toBe(firstTabId)
  })

  it('switchTab swaps the active document and re-snapshots the one being left', () => {
    useStore.getState().openDocument(fakePdfDoc(3), new Uint8Array([1]), 'a.pdf', 'a.pdf', 10)
    const firstTabId = useStore.getState().activeTabId
    vi.advanceTimersByTime(10)
    useStore.getState().openTab(fakePdfDoc(5), new Uint8Array([2]), 'b.pdf', 'b.pdf', 20)
    useStore.getState().setCurrentPage(4)

    useStore.getState().switchTab(firstTabId)
    expect(useStore.getState().fileName).toBe('a.pdf')
    expect(useStore.getState().activeTabId).toBe(firstTabId)
    const bTab = useStore.getState().tabs.find(t => t.fileName === 'b.pdf')
    expect(bTab.currentPage).toBe(4)
  })

  it('closeTab on the active tab falls back to the most recent remaining tab', () => {
    useStore.getState().openDocument(fakePdfDoc(3), new Uint8Array([1]), 'a.pdf', 'a.pdf', 10)
    const firstTabId = useStore.getState().activeTabId
    vi.advanceTimersByTime(10)
    useStore.getState().openTab(fakePdfDoc(5), new Uint8Array([2]), 'b.pdf', 'b.pdf', 20)
    const secondTabId = useStore.getState().activeTabId

    useStore.getState().closeTab(secondTabId)
    expect(useStore.getState().activeTabId).toBe(firstTabId)
    expect(useStore.getState().fileName).toBe('a.pdf')
    expect(useStore.getState().tabs).toHaveLength(0)
  })

  it('closeTab on the active tab clears the document entirely when no tabs remain', () => {
    useStore.getState().openDocument(fakePdfDoc(3), new Uint8Array([1]), 'a.pdf', 'a.pdf', 10)
    const onlyTabId = useStore.getState().activeTabId

    useStore.getState().closeTab(onlyTabId)
    expect(useStore.getState().pdfDoc).toBeNull()
    expect(useStore.getState().activeTabId).toBeNull()
    expect(useStore.getState().tabs).toHaveLength(0)
  })

  it('closeTab on a background tab just removes it, without touching the active document', () => {
    useStore.getState().openDocument(fakePdfDoc(3), new Uint8Array([1]), 'a.pdf', 'a.pdf', 10)
    vi.advanceTimersByTime(10)
    useStore.getState().openTab(fakePdfDoc(5), new Uint8Array([2]), 'b.pdf', 'b.pdf', 20)
    const activeId = useStore.getState().activeTabId
    const backgroundId = useStore.getState().tabs[0].id

    useStore.getState().closeTab(backgroundId)
    expect(useStore.getState().activeTabId).toBe(activeId)
    expect(useStore.getState().fileName).toBe('b.pdf')
    expect(useStore.getState().tabs).toHaveLength(0)
  })
})
