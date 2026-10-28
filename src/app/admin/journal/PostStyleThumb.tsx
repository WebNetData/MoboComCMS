import type { CSSProperties } from 'react'
import type { PostStyleAlign, PostStyleBase } from '@/modules/journal/domain/post-styles'
import css from './post-styles.module.css'

/**
 * A small drawing of an article page in one style (header, cover, lines of text), so a style is chosen by how it
 * looks. `accent` and `align` follow the owner's own choices; `sidebar` draws an article template's side column. Decorative: the name beside it says which style it is.
 */
export default function PostStyleThumb({ base, accent = '', align = 'start', layout = false, sidebar = false }: { base: PostStyleBase | ''; accent?: string; align?: PostStyleAlign; layout?: boolean; sidebar?: boolean }) {
  const style = accent ? { '--thumb-accent': accent } as CSSProperties : undefined
  return (
    <span className={css.thumb} data-base={layout ? 'layout' : base || 'classic'} data-align={align} data-sidebar={sidebar || undefined} style={style} aria-hidden="true">
      <span className={css.thumbHead}>
        <span className={css.thumbPic} />
        <span className={css.thumbWords}><i className={css.thumbKicker} /><i className={css.thumbTitle} /><i className={css.thumbTitle2} /><i className={css.thumbLead} /></span>
      </span>
      <span className={css.thumbCover} />
      <span className={css.thumbBody}><i /><i /><i /><i /></span>
    </span>
  )
}
