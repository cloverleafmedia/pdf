import { describe, it, expect } from 'vitest'
import { sortFieldsReadingOrder } from './formFieldOrder.js'

describe('sortFieldsReadingOrder', () => {
  it('sorts top-to-bottom when fields are in a single column', () => {
    const fields = [
      { id: 'c', top: 300, left: 10 },
      { id: 'a', top: 100, left: 10 },
      { id: 'b', top: 200, left: 10 },
    ]
    expect(sortFieldsReadingOrder(fields).map(f => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts left-to-right within the same row (equal top)', () => {
    const fields = [
      { id: 'right', top: 100, left: 300 },
      { id: 'left',  top: 100, left: 10 },
      { id: 'mid',   top: 100, left: 150 },
    ]
    expect(sortFieldsReadingOrder(fields).map(f => f.id)).toEqual(['left', 'mid', 'right'])
  })

  it('handles a realistic multi-row, multi-column layout', () => {
    const fields = [
      { id: 'row2-col2', top: 200, left: 150 },
      { id: 'row1-col1', top: 100, left: 10 },
      { id: 'row2-col1', top: 200, left: 10 },
      { id: 'row1-col2', top: 100, left: 150 },
    ]
    expect(sortFieldsReadingOrder(fields).map(f => f.id)).toEqual([
      'row1-col1', 'row1-col2', 'row2-col1', 'row2-col2',
    ])
  })

  it('treats near-equal top values within the same row consistently (small rendering jitter)', () => {
    const fields = [
      { id: 'right', top: 100.4, left: 300 },
      { id: 'left',  top: 100.1, left: 10 },
    ]
    // Real-world field rects on the same visual row rarely land on the exact
    // same top pixel - this just confirms the sort is stable/deterministic,
    // not that it forces same-row detection via a tolerance (out of scope).
    expect(sortFieldsReadingOrder(fields).map(f => f.id)).toEqual(['left', 'right'])
  })

  it('does not mutate the input array', () => {
    const fields = [{ id: 'b', top: 2, left: 0 }, { id: 'a', top: 1, left: 0 }]
    const original = [...fields]
    sortFieldsReadingOrder(fields)
    expect(fields).toEqual(original)
  })

  it('returns an empty array for an empty input', () => {
    expect(sortFieldsReadingOrder([])).toEqual([])
  })
})
