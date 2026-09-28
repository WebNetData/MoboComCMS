'use client'

import NextLink from 'next/link'
import { forwardRef, type ComponentProps } from 'react'
import { toPublicPath } from '@/platform/routing/aliases'

type Props = ComponentProps<typeof NextLink>

/**
 * next/link that follows the site's section addresses: href="/games/x"
 * renders as /game/x when the games section is published under /game.
 * Part of the public platform surface, so plugins and code themes use it too.
 */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, ...rest }, ref) {
  const mapped = typeof href === 'string' ? toPublicPath(href) : href && typeof href === 'object' && typeof href.pathname === 'string' ? { ...href, pathname: toPublicPath(href.pathname) } : href
  return <NextLink ref={ref} href={mapped} {...rest} />
})

export default Link
