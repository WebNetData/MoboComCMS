'use client'

import type { ThemeClientModule } from '@/themes/types'
import OrbitalHeader from './header'
import OrbitalFooter from './footer'

const Header: NonNullable<ThemeClientModule['Header']> = (props) => <div data-code-theme="orbital"><OrbitalHeader {...props} /></div>
const Footer: NonNullable<ThemeClientModule['Footer']> = (props) => <div data-code-theme="orbital"><OrbitalFooter {...props} /></div>

export const theme: ThemeClientModule = { Header, Footer }
