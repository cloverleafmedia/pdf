// Shared emoji icon map for annotation types, used by the Sidebar annotations
// list and the Comments Summary report so both stay in sync - previously each
// place would have needed its own copy (and the Sidebar's copy was missing
// rectangle/circle/arrow entirely).
export const ANNOTATION_ICONS = {
  highlight: '🟡',
  note: '📌',
  text: '📝',
  draw: '✏️',
  underline: '▁',
  strikethrough: '—',
  rectangle: '▭',
  circle: '◯',
  arrow: '➜',
}
