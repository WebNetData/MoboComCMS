// A form placed anywhere in written content (owner, 2026-10-28: "like WordPress, with a shortcode or the visual
// editor"). Pure. The shortcode `[form slug="contact"]` (also `[form contact]` and `[فرم contact]`) and the editor's
// «فرم» block both become a placeholder; FormEmbeds mounts the live form into it on the page.

/** A form's address, as the form builder allows it. */
export const FORM_SLUG = /^[a-z][a-z0-9-]{1,79}$/

/** The placeholder a form is mounted into (the slug is already checked, so it needs no escaping). */
export const formPlaceholder = (slug: string) => `<div class="mc-form-embed" data-mc-form="${slug}"></div>`

const SHORTCODE = /\[(?:form|فرم)\s+(?:slug\s*=\s*["“”']?([a-z][a-z0-9-]{1,79})["“”']?|([a-z][a-z0-9-]{1,79}))\s*\/?\]/g

/**
 * Written HTML with each form shortcode replaced by its placeholder. A shortcode shown as code (inside <code> or <pre>)
 * stays as text, and one that names no valid address is left alone.
 */
export function formShortcodes(html: string): string {
  if (!html || !/\[(?:form|فرم)\s/.test(html)) return html
  // Split on code so a shortcode written as an example is never replaced.
  const swap = (whole: string, quoted: string | undefined, bare: string | undefined) => {
    const slug = quoted || bare || ''
    return FORM_SLUG.test(slug) ? formPlaceholder(slug) : whole
  }
  // A paragraph holding only the shortcode is replaced whole (a block inside a <p> is not valid HTML).
  const alone = new RegExp(`<p\\b[^>]*>\\s*${SHORTCODE.source}\\s*</p>`, 'g')
  return html.split(/(<(?:pre|code)\b[\s\S]*?<\/(?:pre|code)>)/i).map((part, index) => (index % 2 ? part : part.replace(alone, swap).replace(SHORTCODE, swap))).join('')
}

/** The shortcode to copy for a form (shown in the forms admin). */
export const formShortcode = (slug: string) => `[form slug="${slug}"]`
