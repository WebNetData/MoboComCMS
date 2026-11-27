import AccountSettings from '@/components/AccountSettings'

export const metadata = { title: 'تنظیمات حساب | ابر موبوکام', robots: { index: false, follow: false } }

export default function CloudAccountPage() {
  return <AccountSettings surface="cloud" />
}
