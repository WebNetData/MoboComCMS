/** How hard a new password is to guess, 0–4, from its length and the kinds of characters in it. Pure. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < 8) return password ? 1 : 0
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  const score = (password.length >= 12 ? 1 : 0) + (kinds >= 2 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (kinds === 4 || password.length >= 16 ? 1 : 0)
  return Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4
}
