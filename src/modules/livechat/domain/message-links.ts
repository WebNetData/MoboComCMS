/** Local references only, including Persian slugs. External URLs remain text. */
export function chatTextParts(body: string): { text: string; href?: string }[] {
  return body.split(/(https?:\/\/[^\s<>]+|(?:^|\s)\/(?!\/)[^\s<>،؛!؟]+)/gi).filter(Boolean).flatMap(text => {
    const url = text.trim().replace(/[.,)\]}]+$/, '')
    if (!/^\/(?!\/)[^\s\\<>]{1,500}$/.test(url)) return [{ text }]
    const at = text.indexOf(url)
    return [...(at ? [{ text: text.slice(0, at) }] : []), { text: url, href: url }, ...(at + url.length < text.length ? [{ text: text.slice(at + url.length) }] : [])]
  })
}
