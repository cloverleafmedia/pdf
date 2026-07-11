import { describe, it, expect } from 'vitest'
import {
  groupTextItemsIntoRows, splitRowIntoCells, detectTableRegions, regionToCsvRows,
  extractTablesFromDocument,
} from './tableDetect.js'

function item(str, x, y, width) {
  return { str, transform: [1, 0, 0, 1, x, y], width: width ?? str.length * 6, height: 10 }
}

describe('groupTextItemsIntoRows', () => {
  it('groups items with identical y into a single row', () => {
    const rows = groupTextItemsIntoRows([item('a', 0, 100), item('b', 50, 100)])
    expect(rows).toHaveLength(1)
    expect(rows[0].items.map(i => i.str)).toEqual(['a', 'b'])
  })

  it('merges items within yTolerance into the same row', () => {
    const rows = groupTextItemsIntoRows([item('a', 0, 100), item('b', 50, 101)], 2)
    expect(rows).toHaveLength(1)
  })

  it('splits items with a large y gap into separate rows', () => {
    const rows = groupTextItemsIntoRows([item('a', 0, 100), item('b', 0, 50)])
    expect(rows).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(groupTextItemsIntoRows([])).toEqual([])
  })

  it('returns an empty array for undefined/null items instead of throwing', () => {
    expect(groupTextItemsIntoRows(undefined)).toEqual([])
    expect(groupTextItemsIntoRows(null)).toEqual([])
  })

  it('sorts rows top-to-bottom and items left-to-right within a row', () => {
    const rows = groupTextItemsIntoRows([
      item('row1b', 50, 100), item('row1a', 0, 100),
      item('row2', 0, 50),
    ])
    expect(rows[0].items.map(i => i.str)).toEqual(['row1a', 'row1b'])
    expect(rows[1].items[0].str).toBe('row2')
  })
})

describe('splitRowIntoCells', () => {
  it('merges two close words into a single cell', () => {
    const cells = splitRowIntoCells([item('Max', 0, 100), item('Mustermann', 20, 100)])
    expect(cells).toHaveLength(1)
    expect(cells[0].text).toBe('Max Mustermann')
  })

  it('splits two values separated by a wide gap into two cells', () => {
    const cells = splitRowIntoCells([item('Name', 0, 100), item('Alter', 100, 100)])
    expect(cells).toHaveLength(2)
    expect(cells.map(c => c.text)).toEqual(['Name', 'Alter'])
  })

  it('detects a 4-column row', () => {
    const cells = splitRowIntoCells([
      item('A', 0, 100), item('B', 100, 100), item('C', 200, 100), item('D', 300, 100),
    ])
    expect(cells).toHaveLength(4)
  })

  it('returns an empty array for an empty row', () => {
    expect(splitRowIntoCells([])).toEqual([])
  })

  it('treats a missing/undefined item width as 0 instead of producing NaN coordinates', () => {
    const cells = splitRowIntoCells([
      { str: 'A', transform: [1, 0, 0, 1, 0, 100] }, // no `width` at all
      { str: 'B', transform: [1, 0, 0, 1, 50, 100] },
    ])
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ text: 'A', x0: 0, x1: 0 })
    expect(cells[1]).toMatchObject({ text: 'B', x0: 50, x1: 50 })
  })

  it('joins overlapping/touching items (gap <= 0) without inserting a spurious space', () => {
    const cells = splitRowIntoCells([
      item('Hello', 0, 100, 30), // occupies x 0-30
      item('World', 25, 100, 30), // starts before the previous item ends
    ])
    expect(cells).toHaveLength(1)
    expect(cells[0].text).toBe('HelloWorld')
  })
})

// Builds a synthetic page of rows: table rows have `cols` cells spaced 100pt
// apart; prose rows are a single wide cell.
function makeRows(spec) {
  // spec: array of 'table3' | 'table2' | 'prose'
  return spec.map((kind, i) => {
    const y = 200 - i * 10
    if (kind === 'prose') return { y, cells: [{ text: 'Ein normaler Fliesstext-Absatz.', x0: 0, x1: 300 }] }
    const cols = kind === 'table2' ? 2 : 3
    const cells = Array.from({ length: cols }, (_, c) => ({ text: `R${i}C${c}`, x0: c * 100, x1: c * 100 + 30 }))
    return { y, cells }
  })
}

describe('detectTableRegions', () => {
  it('finds one region for 5 consecutive 3-column rows amid unrelated prose', () => {
    const rows = makeRows(['prose', 'table3', 'table3', 'table3', 'table3', 'table3', 'prose'])
    const regions = detectTableRegions(rows)
    expect(regions).toHaveLength(1)
    expect(regions[0]).toEqual({ startRow: 1, endRow: 5, columnCount: 3 })
  })

  it('finds no regions in a page of pure prose', () => {
    const rows = makeRows(['prose', 'prose', 'prose', 'prose'])
    expect(detectTableRegions(rows)).toEqual([])
  })

  it('finds two separate table blocks separated by prose', () => {
    const rows = makeRows(['table3', 'table3', 'table3', 'prose', 'prose', 'table2', 'table2', 'table2'])
    const regions = detectTableRegions(rows)
    expect(regions).toHaveLength(2)
    expect(regions[0].columnCount).toBe(3)
    expect(regions[1].columnCount).toBe(2)
  })

  it('excludes a preceding title row (1 cell) from the table region', () => {
    const rows = makeRows(['prose', 'table3', 'table3', 'table3', 'table3'])
    const regions = detectTableRegions(rows)
    expect(regions).toHaveLength(1)
    expect(regions[0].startRow).toBe(1) // title (row 0) not included
  })

  it('tolerates one row with one fewer cell (blank trailing column)', () => {
    const rows = makeRows(['table3', 'table3', 'table3'])
    rows[1].cells = rows[1].cells.slice(0, 2) // one row missing its last column
    const regions = detectTableRegions(rows)
    expect(regions).toHaveLength(1)
    expect(regions[0]).toEqual({ startRow: 0, endRow: 2, columnCount: 3 })
  })

  it('does not create a region for an aligned run shorter than minRows', () => {
    // 2 consecutive 3-column rows satisfy minColumns but not the default
    // minRows=3 - must be skipped one row at a time, not just "not started".
    const rows = makeRows(['table3', 'table3', 'prose'])
    expect(detectTableRegions(rows)).toEqual([])
  })
})

describe('regionToCsvRows', () => {
  it('converts a region into string[][], padding a short row', () => {
    const rows = makeRows(['table3', 'table3'])
    rows[1].cells = rows[1].cells.slice(0, 2)
    const region = { startRow: 0, endRow: 1, columnCount: 3 }
    const result = regionToCsvRows(rows, region)
    expect(result).toEqual([
      ['R0C0', 'R0C1', 'R0C2'],
      ['R1C0', 'R1C1', ''],
    ])
  })
})

function fakePdfDocWithRows(pagesRowSpecs) {
  return {
    numPages: pagesRowSpecs.length,
    getPage: async (pageNum) => ({
      getTextContent: async () => {
        const spec = pagesRowSpecs[pageNum - 1]
        const items = []
        spec.forEach((kind, i) => {
          const y = 200 - i * 10
          if (kind === 'prose') { items.push(item('Ein normaler Fliesstext-Absatz.', 0, y, 200)); return }
          const cols = kind === 'table2' ? 2 : 3
          for (let c = 0; c < cols; c++) items.push(item(`R${i}C${c}`, c * 100, y))
        })
        return { items }
      },
    }),
  }
}

describe('extractTablesFromDocument', () => {
  it('aggregates tables across multiple pages with per-page tableIndex numbering', async () => {
    const doc = fakePdfDocWithRows([
      ['prose', 'table3', 'table3', 'table3', 'table3'],
      ['table2', 'table2', 'table2', 'prose', 'table3', 'table3', 'table3', 'table3'],
    ])
    const results = await extractTablesFromDocument(doc)
    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ pageNum: 1, tableIndex: 0 })
    expect(results[1]).toMatchObject({ pageNum: 2, tableIndex: 0 })
    expect(results[2]).toMatchObject({ pageNum: 2, tableIndex: 1 })
  })

  it('returns an empty array for a document with no detectable tables', async () => {
    const doc = fakePdfDocWithRows([['prose', 'prose', 'prose']])
    const results = await extractTablesFromDocument(doc)
    expect(results).toEqual([])
  })
})
