// Heuristic table detection over pdf.js getTextContent() items - the same
// item shape (item.transform[4]/[5] for x/y, item.width/height) already read
// by piiDetection.js. This is a heuristic, not true table-structure
// recognition: it works well for clearly row/column-aligned tables with
// visible gaps (invoices, reports) and will not handle merged cells, nested
// tables, or tables without visible alignment gaps - documented limitation,
// not a bug to "fix" by adding ML-grade layout analysis here.

// Clusters text items into reading-order rows by y-proximity (PDF y-axis
// increases upward, so rows come out top-to-bottom by iterating in
// descending-y order and matching against already-seen row anchors).
export function groupTextItemsIntoRows(items, yTolerance = 2) {
  const valid = (items || []).filter(i => i.str && i.str.trim())
  const sorted = [...valid].sort((a, b) => b.transform[5] - a.transform[5])
  const rows = []
  for (const item of sorted) {
    const y = item.transform[5]
    let row = rows.find(r => Math.abs(r.y - y) <= yTolerance)
    if (!row) { row = { y, items: [] }; rows.push(row) }
    row.items.push(item)
  }
  for (const row of rows) row.items.sort((a, b) => a.transform[4] - b.transform[4])
  return rows
}

// Merges adjacent items in a row into cells: a normal word-spacing gap keeps
// items in the same cell (joined with a space); a gap much wider than the
// item's own average glyph width is treated as a table column gutter and
// starts a new cell.
export function splitRowIntoCells(rowItems, gapFactor = 2.5) {
  if (!rowItems || !rowItems.length) return []
  const cells = []
  let current = {
    text: rowItems[0].str,
    x0: rowItems[0].transform[4],
    x1: rowItems[0].transform[4] + (rowItems[0].width || 0),
  }
  for (let i = 1; i < rowItems.length; i++) {
    const item = rowItems[i]
    const prev = rowItems[i - 1]
    const prevEnd = prev.transform[4] + (prev.width || 0)
    const gap = item.transform[4] - prevEnd
    const avgCharWidth = prev.width && prev.str.length ? prev.width / prev.str.length : 5
    if (gap > avgCharWidth * gapFactor) {
      cells.push(current)
      current = { text: item.str, x0: item.transform[4], x1: item.transform[4] + (item.width || 0) }
    } else {
      current.text += (gap > 0 ? ' ' : '') + item.str
      current.x1 = item.transform[4] + (item.width || 0)
    }
  }
  cells.push(current)
  return cells.map(c => ({ text: c.text.trim(), x0: c.x0, x1: c.x1 }))
}

// rows: [{ y, cells: [{text,...}] }, ...] (already cell-split, top-to-bottom).
// Finds contiguous runs of rows with a consistent cell count (tolerating one
// fewer cell, for a blank trailing column) that are wide/tall enough to
// plausibly be a table rather than incidental multi-word lines.
export function detectTableRegions(rows, { minColumns = 2, minRows = 3 } = {}) {
  const regions = []
  let i = 0
  while (i < rows.length) {
    const startCount = rows[i].cells.length
    if (startCount < minColumns) { i++; continue }
    let j = i
    while (j < rows.length) {
      const count = rows[j].cells.length
      if (count === startCount || count === startCount - 1) { j++; continue }
      break
    }
    const runLength = j - i
    if (runLength >= minRows) {
      regions.push({ startRow: i, endRow: j - 1, columnCount: startCount })
      i = j
    } else {
      i++
    }
  }
  return regions
}

export function regionToCsvRows(rows, region) {
  return rows.slice(region.startRow, region.endRow + 1).map(row => {
    const texts = row.cells.map(c => c.text)
    while (texts.length < region.columnCount) texts.push('')
    return texts
  })
}

export async function extractTablesFromDocument(pdfDoc, opts = {}) {
  const { yTolerance, gapFactor, minColumns, minRows } = opts
  const results = []
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const content = await page.getTextContent()
    const grouped = groupTextItemsIntoRows(content.items, yTolerance)
    const rows = grouped.map(r => ({ y: r.y, cells: splitRowIntoCells(r.items, gapFactor) }))
    const regions = detectTableRegions(rows, { minColumns, minRows })
    regions.forEach((region, tableIndex) => {
      results.push({ pageNum, tableIndex, rows: regionToCsvRows(rows, region) })
    })
  }
  return results
}
