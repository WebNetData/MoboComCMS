import { local, type SiteLink } from './types'
/** The ordinary editable Site menu owns the public Pay links. */
export const DEFAULT_PAY_NAVIGATION: SiteLink = { label: local('موبوکام‌پی','MoboCom Pay'), href:'/pay', icon:'wallet', children:[{label:local('معرفی خدمات','Services'),href:'/pay'},{label:local('درخواست پذیرندگی','Apply'),href:'/pay/apply'}] }
