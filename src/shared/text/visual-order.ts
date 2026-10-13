import bidiFactory from 'bidi-js'

// A drawing surface that places glyphs from left to right (a PDF page) needs a line of mixed
// Persian and Latin text in the order the eye meets it. The Unicode bidirectional algorithm gives
// the runs; a font engine that shapes Arabic script orders the letters of each word itself, so a
// right-to-left run is handed over word by word, last word first.

const bidi = bidiFactory()

// A number in Persian or Arabic digits, with the separators inside it.
const NUMBER = /([٠-٩۰-۹](?:[٠-٩۰-۹٫٬/.,:-]*[٠-٩۰-۹])?)/

export interface VisualOptions {
  /** The engine turns Persian and Arabic digits round as if they were letters; hand them over turned. */
  turnDigits?: boolean
}

/** The pieces of one line of right-to-left text, in the order they are drawn from left to right. */
export function visualPieces(text: string, options: VisualOptions = {}): string[] {
  if (!text) return []
  const { levels } = bidi.getEmbeddingLevels(text, 'rtl')
  const runs: { level: number; text: string }[] = []
  for (let index = 0; index < text.length; index += 1) {
    const last = runs[runs.length - 1]
    if (last && last.level === levels[index]) last.text += text[index]
    else runs.push({ level: levels[index], text: text[index] })
  }
  // UAX #9, rule L2: from the highest level down to the lowest odd one, reverse each sequence at or above it.
  const highest = Math.max(...runs.map((run) => run.level))
  const lowestOdd = Math.min(...runs.filter((run) => run.level % 2).map((run) => run.level), highest + 1)
  for (let level = highest; level >= lowestOdd; level -= 1) {
    let start = 0
    while (start < runs.length) {
      if (runs[start].level < level) { start += 1; continue }
      let end = start
      while (end < runs.length && runs[end].level >= level) end += 1
      runs.splice(start, end - start, ...runs.slice(start, end).reverse())
      start = end
    }
  }
  const pieces: string[] = []
  for (const run of runs) {
    if (run.level % 2) {
      const words = run.text.split(/( +)/).filter(Boolean).reverse()
      for (const word of words) pieces.push([...word].map((char) => bidi.getMirroredCharacter(char) || char).join(''))
    } else {
      if (!options.turnDigits) { pieces.push(run.text); continue }
      // Each number is its own piece, handed over turned: the engine lays it out as a right-to-left word and it comes out as written.
      run.text.split(NUMBER).forEach((part, index) => { if (part) pieces.push(index % 2 ? [...part].reverse().join('') : part) })
    }
  }
  return pieces
}
