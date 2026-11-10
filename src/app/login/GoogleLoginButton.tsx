import { GoogleMark } from '@/components/GoogleMark'

/**
 * "Continue with Google" (Google's own button style: its four-colour mark on a neutral surface, as its sign-in branding
 * asks). A plain link: the server sends the browser on to Google (src/modules/identity/server/http/google.ts).
 */
export default function GoogleLoginButton({ next, label = 'ادامه با گوگل' }: { next?: string; label?: string }) {
  const href = next ? `/api/login/google?${new URLSearchParams({ next }).toString()}` : '/api/login/google'
  return <a className="auth-google" href={href} rel="nofollow"><GoogleMark /><span>{label}</span></a>
}
