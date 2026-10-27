import { redirect } from 'next/navigation'

/** The section bars are a tab of «مدیریت منوها» now; old links and bookmarks land on it. */
export default function AdminMegaMenuPage() {
  redirect('/admin/menus?tab=sections')
}
