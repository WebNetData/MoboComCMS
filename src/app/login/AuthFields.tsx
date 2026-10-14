'use client'

import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import Icon from '@/components/site/Icon'
import { passwordStrength } from './password-strength'

/** An input of the sign-in and sign-up forms, with its icon at the start. */
export function AuthInput({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="auth-input"><span className="auth-input-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>{children}</div>
}

/** A password field whose owner may show what they typed. */
export function PasswordInput({ fa, ...props }: InputHTMLAttributes<HTMLInputElement> & { fa: boolean }) {
  const [shown, setShown] = useState(false)
  return <AuthInput icon="lock">
    <input {...props} className="input" type={shown ? 'text' : 'password'} dir="ltr" spellCheck={false} />
    <button type="button" className="auth-reveal" aria-pressed={shown} aria-label={shown ? (fa ? 'پنهان کردن رمز' : 'Hide password') : (fa ? 'نمایش رمز' : 'Show password')} onClick={() => setShown((value) => !value)}>
      <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
    </button>
  </AuthInput>
}

const STRENGTH = { fa: ['', 'ضعیف', 'متوسط', 'خوب', 'قوی'], en: ['', 'Weak', 'Fair', 'Good', 'Strong'] }

export function PasswordStrength({ password, fa }: { password: string; fa: boolean }) {
  const level = passwordStrength(password)
  return <div className={`auth-strength is-${level}`} aria-live="polite">
    <span className="auth-strength-bars" aria-hidden="true"><i /><i /><i /><i /></span>
    <span>{level ? `${fa ? 'قدرت رمز' : 'Strength'}: ${STRENGTH[fa ? 'fa' : 'en'][level]}` : (fa ? 'دست‌کم ۸ نویسه؛ ترکیب حرف، عدد و نماد قوی‌تر است.' : 'At least 8 characters; letters, numbers and symbols are stronger.')}</span>
  </div>
}
