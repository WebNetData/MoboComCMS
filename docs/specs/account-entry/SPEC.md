# Signing up, signing in and leaving

## Audited evidence / scope
The first minutes of a new member were walked through in a browser on the running site: sign-up, the screen after it, sign-in with a wrong and a right password, the profile completion page, sign-out, a second sign-up with the same e-mail, and a password change with a second device signed in. The pages themselves worked. Eight things around them did not.

## What was wrong and what it is now
1. **The password label said "at least 6 characters"** while the server refuses anything under 8 (and the hint under the same field said 8). The dictionary texts now say 8 or nothing.
2. **Straight after sign-up the member was shown the mobile-number form**, without a word that the account had been created; the confirmation only exists on the e-mail form. With `?registered=1` the e-mail form opens.
3. **A new member could not use the account before entering a full postal address with a map position**, because the default set of required profile fields included the address. A site that has not designed its own fields now requires the first and family name only; the address stays on the form as optional, and checkout asks for one whenever an order needs it. An owner who saved their own field design, or wants the address required, is unaffected.
4. **The completion page could not be left**: no sign-out. It has one now.
5. **Sign-out in the account, admin and reseller panels could not be clicked** at common desktop sizes: the translate widget sat on the corner where the side menu ends. In those panels the widget is on the other side.
6. **The sign-up page reported a hydration mismatch for every returning visitor**: it read the theme cookie while rendering in the browser, which the server had not. It is now a server page around a client form, like the sign-in page.
7. **Changing the password in the profile left every other device signed in.** A reset already ended all sessions; a change did not. It does now: the change sets the same moment the session check reads, the member is signed out here too and sent to sign in with the new password, with a notice saying so.
8. **Wording left from the VPN service** on both forms ("a new connection", "manage all your subscriptions", "manage your connections") is replaced.

## Rules kept
Password length 8–128 on the server. Sign-up does not sign the member in (the security-check token is single use). A wrong password and an unknown e-mail answer the same sentence. Recovery by e-mail or SMS appears only when the site has that channel configured; with neither, the page says recovery is unavailable.

## Acceptance
`scripts/profile-fields.test.cjs`: the default required fields, an owner's stricter design kept, the password texts against the server rule, the tab after sign-up, the sign-out on the completion page, the theme source of the sign-up page, and the session rule after a password change. Browser, running site: three sign-ups (full name → account; one-word name → completion page asking for the family name only → account; leaving the completion page), wrong password, sign-out from the panel, the account page when signed out, a second sign-up with the same e-mail, a password change with a second device (both signed out, old password refused, new one accepted), no hydration error on the sign-up page after visiting another page.

## For launch (not code)
Password recovery needs SMTP or the SMS panel configured in the admin; without either a member who forgets the password has to contact support.

## Not included
Signing the member in automatically after sign-up, e-mail address confirmation, and "sign out other devices" without changing the password.
