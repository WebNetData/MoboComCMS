# Sign-in and sign-up pages — the look (2026-10-14)

Owner asked for very professional, modern sign-in and sign-up pages. This slice changes presentation only: the sign-in methods (mobile code, e-mail and password, Telegram, 2-step), Turnstile, redirects and every request stay as they were.

## What changed
- `src/app/login/AuthFrame.tsx`: an aurora behind a glass card; the story panel lit by the site's own colour, with a decorative glimpse of the account (wallet, a delivered order, a support reply — `aria-hidden`), the site's sections, the three features and a secure-sign-in line. Texts come from one table per language. `variant` (`login` | `register`).
- `src/app/login/AuthFields.tsx`: `AuthInput` (an icon at the start of an input), `PasswordInput` (show/hide with a named `aria-pressed` button), `PasswordStrength` (four bars and a word, `aria-live`); `password-strength.ts` is the pure score.
- `src/app/auth.css` (after `application-polish.css`, whose `.auth-*` rules it refines): the card, the story, segmented mode switch, inputs, the button, the strength meter; one column under 760 px with the story folded to its title; reduced motion stops the drifting lights and floating cards.

## Acceptance
- `scripts/site.test.cjs` — strength scores, the glimpse is decorative, the toggle is pressed-state.
- Browser: `.mobocom/claude-tools/pw-auth.cjs` (11) — 1440 light and dark, 390 light and dark, no sideways scroll, story texts ≥ 4.5:1 on the dark panel, the toggle shows and hides, the meter moves from weak to strong, the story and form stack on a phone, no page error.
- React Doctor (`--scope files`) on `AuthFrame.tsx`, `AuthFields.tsx`: no issues. Older warnings in `LoginForm.tsx` / `RegisterForm.tsx` (buttons without `type`, a fetch without a status check, complexity) were there before and are untouched.
