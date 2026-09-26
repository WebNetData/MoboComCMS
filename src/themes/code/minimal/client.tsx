'use client'
import { DefaultThemeHeader, DefaultThemeFooter } from '@/themes/sdk/client'
import type { ThemeClientModule } from '@/themes/types'

const Header: NonNullable<ThemeClientModule['Header']> = (props) => <div data-code-theme="minimal"><DefaultThemeHeader {...props}/></div>
const Footer: NonNullable<ThemeClientModule['Footer']> = (props) => <div data-code-theme="minimal"><DefaultThemeFooter {...props}/></div>
export const theme: ThemeClientModule = { Header, Footer }
