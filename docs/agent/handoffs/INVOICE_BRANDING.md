# Shared invoice branding — 2026-10-15

Continue `.mobocom/autonomous-foundation`, branch `feat/invoice-site-logo-2026-10-15`, from main after merged PR190. Root checkout has unrelated owner work. Extend Billing/Site/Settings/Media; no separate invoice or branding store.

## Owners and behavior

- `billing/domain/official-invoice.invoiceLogo`: validated explicit invoice override → primary site wordmark → compact mark → seller initial. `billing/server/official-invoice.getBrandedInvoiceProfile` composes the original profile and canonical Site reader. Standard/official/native PDF share it across invoice sources.
- Raw `getInvoiceProfile` stays raw for Admin; saving seller details cannot pin inherited branding. It uses the existing fresh Settings reader so another process's profile change is seen immediately. `/admin/invoice-profile` retains the optional override and now explains inheritance.
- `components/billing/InvoiceLogo` contains wide/square images and handles errors before hydration through its ref, plus later onError. Existing layouts and written seller names remain; PDF gives wide logos a readable rectangle.
- Native PDF embeds only existing local `/api/media/covers/...` images; no new remote fetch/SSRF surface. Remote custom URLs retain HTML behavior but are not embedded in native PDF. Use Branding/Media uploads for consistent outputs.
- Print has named official-invoice (A4 landscape) and shipping-label (100×150mm) pages. Invoice responsive rules apply to screens; they previously leaked into print, while the unscoped label size overrode invoice size.
- No schema/migration, new permission/configuration system, route or financial-row changes. Existing access and image normalization remain.

## Executed verification

- Host focused units25; final full npm run check on tracked-source Linux UID1000/no .env:654 site,53 isolated connected,4 backup,10 billing, full TypeScript and repository gates. No fresh production build for this presentation slice.
- Registered native PostgreSQL `invoice-logo` passed on owned database with existing117 migrations: seven source kinds, owner/other/staff, exact unchanged money/history rows, raw Admin save, current inheritance/override/compact/empty state and another process's update despite warm Settings cache.
- Three isolated faults (lost inheritance, lost override priority, stale profile reader) each failed; restored source passed. Live app source was never faulted.
- Final actual localhost browser: product/content/membership/form/plan/manual/wallet standard/official pages and private PDF; other/guest denial; actual Admin override/clear and missing-image fallback. Eight light/dark1440/390 views passed header-scoped axe, loaded images and no document overflow; runtime errors empty.
- Native PDF: one A4 portrait page with embedded logo. Browser print: one A4 landscape page with logo. Both rasterized with PyMuPDF1.28.2 and visually inspected. Isolated Chromium check with actual label CSS and app margin/box-sizing reset retained one100×150mm page; no whole shipping-workflow certification.
- React Doctor four files exit0 with ten existing reviewed warnings/no suppressions; redacted diff Gitleaks0. No warning-free/comprehensive security claim.
- Retained failed attempts: startup before readiness, stale profile cache and pre-hydration image failure. Early print exposed A6/mobile-print collisions. Final reports are separate.

Raw ignored evidence/helpers: root `.mobocom/invoice-logo-evidence`, `.mobocom/invoice-logo-*.cjs`. Owned actors/invoices/orders/audit/image removed; original profile restored by exact installed-value claim; app restarted on3000; fake session file removed. Preserve owner `.serena/`, `public/demo/` and root work. No hosted Actions/push/PR/merge/deploy for this slice.
