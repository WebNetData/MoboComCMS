# Account dashboard — tidy and clear (2026-10-15)

Owner asked for a member's dashboard that is not confusing, every section tidy, modern and professional. This slice audited every page under `/dashboard` (screenshots at 1440 light/dark and 390) and fixed what confused or broke; addresses, menu entries, APIs and data stay as they were.

## Found and changed
| Page | Found | Now |
| --- | --- | --- |
| Home | One "wallet balance" tile per currency ($0.00, ۰ تومان, ۰ ریال), unpaid invoices hidden in their footers; service orders titled «سفارش #…»; a tall empty cover; a broken emoji placeholder | One wallet tile in the site's currency (others only when they hold money), one tile for unpaid invoices that opens them; orders named as their invoices (`invoiceSubject`); a slim cover; icons |
| Orders | Services and subscriptions in a bare table titled «سفارش»; an empty "current" box above them | «خدمات، درخواست‌ها و اشتراک‌ها» as readable rows (title, description, state, invoice/pay), ten then the rest behind one click; a small empty state when services exist |
| Invoices | A wide table running out of its card, every invoice at once, totals of all currencies in one line | Tiles that filter (to pay, paid, all), chips with counts, rows with title, description, deadline and the one next step, twenty at a time; `?status=UNPAID` opens the unpaid ones |
| Wallet | Raw type codes (`TOPUP`), the balance column cut off, four equal tiles | A balance card (other currencies as chips), top-up card, a readable history with Persian states and the balance after each |
| Requests | Every request at once (10,000 px) | Status chips with counts (to pay, in progress, done, rejected), ten at a time, «ثبت دوباره» |
| Purchases | «This feature is disabled» in English | A Persian message |
| Menu | «باشگاه مشتریان» shown while the club is off | Shown only while the shop runs it |
| Loading | An invisible placeholder (settings looked empty for seconds) | A visible shimmer |

Shared styles: `src/app/dashboard-tidy.css` (`dt-*`), after `account-home.css`.

## Acceptance
Browser: `.mobocom/claude-tools/pw-dashboard.cjs` (17) — checked against the member's own data (the unpaid tile equals the unpaid invoices, no order called just «سفارش», the filters show only their rows, twenty / ten at a time, no raw codes, Persian when a module is off, no sideways scroll at 390, no page error). Screenshots: `.mobocom/claude-tools/shot-dashboard.cjs`.

## Not changed
Notifications, tickets, settings, library, games, reviews, public profile, gift cards, addresses, referrals and advertising already followed the newer design; they were checked, not rebuilt.
