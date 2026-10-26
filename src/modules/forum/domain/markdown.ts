/**
 * Forum Markdown (pure, shared by server rendering and the composer preview).
 *
 * Security model: every piece of user text is HTML-escaped before any markup
 * is produced, and each generated fragment is swapped for an opaque token so
 * later passes can never re-interpret it. Only http(s) and same-site paths
 * become links or images. Supported: paragraphs, line breaks, # headings,
 * lists, > quotes, [quote="user, post:N, topic:M"] quotes, ``` code blocks,
 * `code`, **bold**, *italic*, ~~strike~~, [links](url), ![images](url),
 * bare URLs, @mentions, :emoji: shortcodes and [poll] blocks (rendered as a
 * placeholder the topic view fills with the live poll).
 */

import { POLL_BLOCK } from '@/modules/forum/domain/discourse'
import { profileAddress } from '@/modules/identity/domain/profile-address'

export interface MarkdownOptions {
  /** Render ![](url) as images (trust-level gated); otherwise as links. */
  images?: boolean
  /** Turn URLs into links; when false they stay plain text. */
  links?: boolean
}

const TOKEN = '\u0000'
const USERNAME = '[A-Za-z0-9_]{3,20}'

export const EMOJI: Record<string, string> = {
  smile: '😄', laughing: '😆', wink: '😉', heart: '❤️', '+1': '👍', thumbsup: '👍', '-1': '👎', clap: '👏', fire: '🔥', tada: '🎉',
  thinking: '🤔', rocket: '🚀', eyes: '👀', pray: '🙏', ok_hand: '👌', cry: '😢', joy: '😂', star: '⭐', check: '✅', x: '❌', warning: '⚠️', bulb: '💡',
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

/** http(s) URL or a same-site absolute path (never protocol-relative). */
export function safeUrl(raw: string): string | null {
  const url = raw.trim()
  if (/^https?:\/\/[^\s<>"'`]+$/i.test(url)) return url
  if (/^\/(?!\/)[^\s<>"'`]*$/.test(url)) return url
  return null
}

class Tokens {
  private items: string[] = []
  put(html: string) { this.items.push(html); return `${TOKEN}${this.items.length - 1}${TOKEN}` }
  restore(text: string): string {
    let out = text
    // Tokens may contain tokens (bold around a link); resolve until stable.
    for (let depth = 0; depth < 6 && out.includes(TOKEN); depth++) out = out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => this.items[Number(index)] ?? '')
    return out
  }
}

function linkTag(url: string, label: string) {
  const external = /^https?:/i.test(url)
  return `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="nofollow ugc noopener noreferrer"' : ''}>${label}</a>`
}

function inline(raw: string, tokens: Tokens, options: Required<MarkdownOptions>): string {
  let text = raw
  // 1. Code spans keep their content literally.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => tokens.put(`<code>${escapeHtml(code)}</code>`))
  // 2. Images and links, before escaping so URLs are checked as typed.
  text = text.replace(/!\[([^\]\n]{0,200})\]\(([^)\s]+)\)/g, (match, alt: string, href: string) => {
    const url = safeUrl(href)
    if (!url) return match
    if (!options.images) return tokens.put(linkTag(url, escapeHtml(alt || url)))
    return tokens.put(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`)
  })
  text = text.replace(/\[([^\]\n]{1,300})\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    const url = safeUrl(href)
    if (!url || !options.links) return match
    return tokens.put(linkTag(url, escapeHtml(label)))
  })
  if (options.links) {
    text = text.replace(/\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}،؛]/gi, (url) => tokens.put(linkTag(url, escapeHtml(url))))
  }
  // 3. Mentions.
  text = text.replace(new RegExp(`(^|[^\\w@/])@(${USERNAME})\\b`, 'g'), (_m, before: string, name: string) =>
    `${before}${tokens.put(`<a class="fr-mention" href="${profileAddress(name.toLowerCase())}">@${name}</a>`)}`)
  // 4. Escape what is left, then emphasis (operating on escaped text is safe).
  text = escapeHtml(text)
  const wrap = (tag: string) => (_m: string, inner: string) => `<${tag}>${inner}</${tag}>`
  const wrapAfter = (tag: string) => (_m: string, before: string, inner: string) => `${before}<${tag}>${inner}</${tag}>`
  text = text.replace(/\*\*([^*\n]+)\*\*/g, wrap('strong')).replace(/__([^_\n]+)__/g, wrap('strong'))
  text = text.replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, wrapAfter('em')).replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?،]|$)/g, wrapAfter('em'))
  text = text.replace(/~~([^~\n]+)~~/g, wrap('del'))
  text = text.replace(/:([a-z0-9_+-]{1,20}):/g, (match, name: string) => EMOJI[name] ?? match)
  return text
}

const QUOTE_BLOCK = new RegExp(`\\[quote="(${USERNAME})(?:,\\s*post:(\\d{1,6}))?(?:,\\s*topic:(\\d{1,9}))?"\\]\\n?([\\s\\S]*?)\\n?\\[\\/quote\\]`, 'g')

function blocks(source: string, tokens: Tokens, options: Required<MarkdownOptions>, depth: number): string {
  let text = source
  // Polls become a slot the topic view renders (options are never shown as a plain list).
  if (depth === 0) text = text.replace(POLL_BLOCK, (_m, attrs: string) => {
    const name = (/name=(?:"([^"]*)"|(\S+))/.exec(attrs)?.slice(1).find(Boolean) || 'poll').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'poll'
    return `\n${tokens.put(`<div class="fr-poll-slot" data-poll="${name}"></div>`)}\n`
  })
  // Fenced code blocks.
  text = text.replace(/^```([\w+-]{0,20})\n([\s\S]*?)\n?```[ \t]*$/gm, (_m, lang: string, code: string) =>
    `\n${tokens.put(`<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`)}\n`)
  // Discourse-style attributed quotes (one level of nesting is rendered).
  text = text.replace(QUOTE_BLOCK, (_m, user: string, post: string | undefined, topic: string | undefined, inner: string) => {
    const who = post && topic ? `<a href="/forum/t/${topic}#post-${post}">@${user}</a>` : `<a href="${profileAddress(user.toLowerCase())}">@${user}</a>`
    const body = depth < 2 ? blocks(inner, tokens, options, depth + 1) : escapeHtml(inner)
    return `\n${tokens.put(`<aside class="fr-quote"><div class="fr-quote-head">${who}:</div><blockquote>${body}</blockquote></aside>`)}\n`
  })

  const out: string[] = []
  const lines = text.split('\n')
  let paragraph: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []
  const flushParagraph = () => { if (paragraph.length) { out.push(`<p dir="auto">${paragraph.map((line) => inline(line, tokens, options)).join('<br>')}</p>`); paragraph = [] } }
  const flushList = () => { if (list) { out.push(`<${list.type}>${list.items.map((item) => `<li>${inline(item, tokens, options)}</li>`).join('')}</${list.type}>`); list = null } }
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${depth < 2 ? blocks(quote.join('\n'), tokens, options, depth + 1) : escapeHtml(quote.join(' '))}</blockquote>`); quote = [] } }
  const flushAll = () => { flushParagraph(); flushList(); flushQuote() }

  for (const line of lines) {
    const trimmed = line.trim()
    if (new RegExp(`^${TOKEN}\\d+${TOKEN}$`).test(trimmed)) { flushAll(); out.push(trimmed); continue }
    const quoteLine = /^>\s?(.*)$/.exec(line)
    if (quoteLine) { flushParagraph(); flushList(); quote.push(quoteLine[1]); continue }
    flushQuote()
    if (!trimmed) { flushParagraph(); flushList(); continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) { flushAll(); const level = heading[1].length + 2; out.push(`<h${level}>${inline(heading[2], tokens, options)}</h${level}>`); continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushAll(); out.push('<hr>'); continue }
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed)
    const numbered = /^\d{1,3}[.)]\s+(.+)$/.exec(trimmed)
    if (bullet || numbered) {
      flushParagraph()
      const type = bullet ? 'ul' : 'ol'
      if (list && list.type !== type) flushList()
      if (!list) list = { type, items: [] }
      list.items.push((bullet || numbered)![1])
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushAll()
  return out.join('')
}

/** Markdown → safe HTML. */
export function renderMarkdown(source: string, options: MarkdownOptions = {}): string {
  const resolved: Required<MarkdownOptions> = { images: options.images ?? true, links: options.links ?? true }
  const tokens = new Tokens()
  const text = String(source || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n')
  return tokens.restore(blocks(text, tokens, resolved, 0))
}

/** Plain text for listings, notifications and meta descriptions. */
export function markdownExcerpt(source: string, max = 180): string {
  const flat = String(source || '').replace(/\r\n?/g, '\n')
    .replace(POLL_BLOCK, (_m, attrs: string) => ` 📊 ${/title="([^"]*)"/.exec(attrs)?.[1] || 'نظرسنجی'} `)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(QUOTE_BLOCK, ' ')
    .replace(/^>.*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/:([a-z0-9_+-]{1,20}):/g, (match, name: string) => EMOJI[name] ?? match)
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Usernames mentioned outside code and quotes (lowercase, unique, at most 10). */
export function extractMentions(source: string): string[] {
  const text = String(source || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(QUOTE_BLOCK, ' ').replace(/^>.*$/gm, ' ')
  const found = new Set<string>()
  for (const match of text.matchAll(new RegExp(`(^|[^\\w@/])@(${USERNAME})\\b`, 'g'))) {
    found.add(match[2].toLowerCase())
    if (found.size >= 10) break
  }
  return [...found]
}

/** Number of links a post contains (new users are limited). */
export const countLinks = (source: string) => (String(source || '').match(/https?:\/\//gi) || []).length
