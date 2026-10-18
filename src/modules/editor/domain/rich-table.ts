import type { RichTextNode } from '@/modules/editor/domain/rich-text'

export const TABLE_LIMITS = { rows: 100, columns: 20 } as const

/** A rectangular bounded grid, including merged cells. Never trust a pasted table's spans. */
export function validTable(rows: RichTextNode[]): boolean {
  if (!rows.length || rows.length > TABLE_LIMITS.rows) return false
  const occupied = new Set<string>()
  let width = 0
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].content || []
    if (cells.length > TABLE_LIMITS.columns) return false
    let column = 0
    for (const cell of cells) {
      while (occupied.has(`${r}:${column}`)) column++
      const colspan = Number(cell.attrs?.colspan || 1), rowspan = Number(cell.attrs?.rowspan || 1)
      if (column + colspan > TABLE_LIMITS.columns || r + rowspan > rows.length) return false
      for (let y = r; y < r + rowspan; y++) for (let x = column; x < column + colspan; x++) {
        const key = `${y}:${x}`
        if (occupied.has(key)) return false
        occupied.add(key)
      }
      column += colspan
    }
    let rowWidth = 0
    while (occupied.has(`${r}:${rowWidth}`)) rowWidth++
    if (r === 0) width = rowWidth
    if (!width || rowWidth !== width || column > width) return false
  }
  return true
}
