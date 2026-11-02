import Icon from '@/components/site/Icon'

/** The existing sign-in Suspense boundary has a visible, named pending state. */
export default function AuthLoading() {
  return <main className="auth-loading">
    <div className="auth-loading-card" role="status" aria-label="در حال آماده‌سازی ورود" aria-busy="true">
      <span className="auth-loading-icon"><Icon name="user" size={28} /></span>
      <p>در حال آماده‌سازی ورود…</p>
      <div className="auth-loading-bars" aria-hidden="true"><i /><i /><i /></div>
    </div>
  </main>
}
