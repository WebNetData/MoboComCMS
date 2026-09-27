import { latinDigits } from '@/shared/text/digits'

/**
 * Persian-aware text normalization for search.
 *
 * Users type the same word many ways: Arabic "ي/ك" vs Persian "ی/ک", with or
 * without the zero-width non-joiner ("نرم‌افزار", "نرم افزار", "نرمافزار"),
 * with diacritics, Persian or Latin digits, upper or lower case. Both the
 * indexed text and the query go through the same function so they meet.
 */
const CHAR_MAP: Record<string, string> = {
  'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'ؤ': 'و',
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
}

// Harakat, tanween, shadda, sukun, superscript alef and tatweel.
const DIACRITICS = /[ً-ٰٟـ]/g
const JOINERS = /[‌‍‎‏­﻿]/g
const SEPARATORS = /[^\p{L}\p{N}]+/gu

/** Lowercase, unify letters and digits, turn joiners and punctuation into single spaces. */
export function normalizePersian(value: unknown): string {
  return latinDigits(String(value ?? ''))
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[يىئكةۀؤأإآٱ]/g, (char) => CHAR_MAP[char] || char)
    .replace(JOINERS, ' ')
    .replace(SEPARATORS, ' ')
    .trim()
}

/** Same text without spaces, so "نرم افزار" and "نرم‌افزار" both contain "نرمافزار". */
export const compactPersian = (value: unknown) => normalizePersian(value).replace(/ /g, '')

/** Indexed form: normalized words followed by the compact form of the title. */
export function searchableText(title: string, ...rest: string[]): string {
  const body = [title, ...rest].map(normalizePersian).filter(Boolean).join(' ')
  return `${body} ${compactPersian(title)}`.slice(0, 4000)
}

/** Distinct query tokens (at most 8), shortest meaningful length 1 for digits, 2 otherwise. */
export function searchTokens(query: unknown): string[] {
  const tokens = normalizePersian(query).split(' ').filter((token) => token.length >= 2 || /\d/.test(token))
  return [...new Set(tokens)].slice(0, 8)
}

/**
 * Relevance score of a document for normalized query tokens. Every token must
 * match somewhere (AND); title matches, prefix matches and whole-phrase
 * matches rank higher. Returns 0 when the document does not match.
 */
export function relevance(tokens: string[], title: string, text: string, phrase = tokens.join(' ')): number {
  if (!tokens.length) return 0
  const normalizedTitle = normalizePersian(title)
  const compactTitle = normalizedTitle.replace(/ /g, '')
  const titleWords = normalizedTitle.split(' ')
  // Very short tokens ("وی", "ال") only count at the start of a word, or they match inside everything.
  let textWords: string[] | null = null
  let score = 0
  for (const token of tokens) {
    const short = token.length < 3 && !/\d/.test(token)
    if (titleWords.includes(token)) score += 12
    else if (titleWords.some((word) => word.startsWith(token))) score += 8
    else if (!short && compactTitle.includes(token)) score += 5
    else if (short ? (textWords ??= text.split(' ')).some((word) => word.startsWith(token)) : text.includes(token)) score += 2
    else return 0
  }
  if (normalizedTitle === phrase) score += 40
  else if (normalizedTitle.startsWith(phrase)) score += 20
  else if (tokens.length > 1 && normalizedTitle.includes(phrase)) score += 10
  return score
}
