const MAX_CANDIDATE_TERMS = 24

/** A bounded set of character trigrams for database-side typo candidate filtering. */
export function typoCandidateTerms(tokens: string[]): string[] {
  const terms = new Set<string>()
  for (const token of tokens) {
    if (token.length < 4 || /\d/.test(token)) continue
    for (let index = 0; index <= token.length - 3; index++) {
      terms.add(token.slice(index, index + 3))
      if (terms.size >= MAX_CANDIDATE_TERMS) return [...terms]
    }
  }
  return [...terms]
}

function oneEditApart(left: string, right: string): boolean {
  const a = Array.from(left)
  const b = Array.from(right)
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) === 1
}

/** Returns a single-token, one-edit query correction supported by a current card title. */
export function correctionFromTitle(tokens: string[], normalizedTitle: string): string | null {
  const titleTokens = normalizedTitle.split(' ').filter(Boolean)
  const possibilities = new Set<string>()
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.length < 4 || /\d/.test(token)) continue
    const otherTokens = tokens.filter((_, otherIndex) => otherIndex !== index)
    if (!otherTokens.every((other) => titleTokens.includes(other))) continue
    for (const candidate of new Set(titleTokens)) {
      if (candidate === token || candidate.length < 4 || /\d/.test(candidate)) continue
      if (oneEditApart(token, candidate)) possibilities.add(tokens.map((value, tokenIndex) => tokenIndex === index ? candidate : value).join(' '))
    }
  }
  return possibilities.size === 1 ? [...possibilities][0] : null
}
