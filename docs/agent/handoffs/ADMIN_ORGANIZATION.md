# Admin organization, staff roles and modular features — continuation

Owner, 2026-11-13: «سیستم اصولی و مرتب باید توسعه داده بشه؛ کارمندها و خودم نباید گیج بشیم؛ پروژه ماژولار است. توسعه را در معماری موبوکام ثبت کن تا ایجنت بعدی ادامه بدهد.» This file is the continuation source for Admin information architecture (IA), staff roles and putting a feature in its own module. It records rules, what is done with its evidence, and the next slices. It does not claim that the whole Admin is finished.

## Rules (keep them in every slice)

1. **Organize by job, not by builder.** A link sits where the person doing that work looks for it. Each module names its own area in its manifest (`adminMenu.area`, one of `EXTENSION_ADMIN_AREAS` in `platform/extensions/contracts.ts`). Core groups live in `src/app/admin/layout.tsx` (`CORE`), and the areas and their order in `components/admin/navigation/groups.ts` (`CONTROL_AREAS`).
2. **Never change an address or a permission while moving a link.** Reorganizing changes only the group, its order, the heading and the label. Changing a guard is its own reviewed change, with tests.
3. **A switchable feature is a module.** A feature that a business may not use, such as the in-store desk, gets `src/plugins/<id>/manifest.json`, which declares `adminPaths`, its menu group and its own permission. Its APIs call `moduleGuard('<id>')`. Its code stays with the owner of its data: do not move money, stock or audit logic into a plugin. Run `node scripts/generate-extensions.mjs` after any manifest change; the generated catalog and AI knowledge are committed.
4. **One name per thing.** No two links in the Admin may share a label (the duplicate «مشتریان (CRM)» was renamed). Labels are Persian with an English `L()` pair; a label says what the page is for.
5. **Tabs inside a section come from the filtered menu**, never from the session. The session carries no permission list for a full admin. `StoreShell` reads `useControlNavigation()` and shows a tab only when its link is in this person's menu; reuse that pattern for any section tab bar.
6. **Staff roles and member groups are different.** A role opens the Admin. Its single source is `identity/domain/staff-roles.ts`: ready roles by job, `CORE_PERMISSION_LABELS`, and `permissionLabel()` (plugin permissions are named by their manifest). A member group (`/admin/user-groups`, «گروه‌های اعضا و مشتریان») gives customers benefits and site access and never opens the Admin. A new staff job is a new template there. A new core permission needs a label there and goes into `CORE_ADDED_LATER` (`rbac.ts`).
7. **Group order scale** inside an area: core and module groups share one number line. Sales uses 5 (in-store), 10 (store), 20 (all orders), 25 (services), then 46 and up. Pick a number that puts the group where the job belongs; never renumber other groups to make room.
8. **Validation for a slice:** scoped tsc; the tests that read the layout and manifests (`account-security`, `content-controls`, `routes`, `navigation`, `forms`, `moderation-queue`, `brand`, `updater`); the tools directory (`/admin/site-management`) dumped in a browser; for a page you changed, 1440 and 390 with axe; React Doctor. Run as the role the change is for when possible.

## Current map (2026-11-13)

- **Home:** dashboard, analytics, moderation queue, all tools.
- **Content:** one group per section, from its manifest: magazine 20, games 40, cinema 50, music 60, software 70, prompts 75, PDF 180. Then «کتابخانه و منابع مشترک» 190 (media, taxonomy, collections, people, studios) and «تصویر، دانلود و حق نشر» 195 (images, watermark, download protection, copyright).
- **AI:** overview, assistants and generation, sales and CRM, providers and monitoring.
- **Community:** forum, community and profiles, reviews and business experiences.
- **Sales:** «فروش و خدمات حضوری» 5 (`plugins/instore`), store 10 (orders and delivery, goods and stock, customers and marketing, settings), all orders 20, services 25, Cloud, VIP, paid content, VPN 92 (VPN resellers now sit here).
- **Finance:** finance and payment setup.
- **Users:** «همهٔ کاربران و مشتریان», «گروه‌های اعضا و مشتریان», registration fields. Team: «نقش‌ها و دسترسی کارکنان», then section managers and authors. Also support, and live chat with its CRM file.
- **Marketing:** SEO 10, offers 20, «ارتباط با مشتری و اتوماسیون» 25 (moved here from System), messaging 30, popups, ads, links.
- **Website:** design and brand, pages and forms, contact and trust.
- **System:** «تنظیمات پایه» 10, «به‌روزرسانی و داده‌ها» 15, health, security, email/SMS/connections, extensions, repository, performance, server panel.

## Done

- **In-store module (PR #458, merged):** `plugins/instore`, the `instore.sell` cashier permission, desk guards, the store menu grouped, Sales area order, store and desk tabs from the filtered menu. Details are in [STORE_COUNTER_SALES](STORE_COUNTER_SALES.md#in-store-module--2026-11-13).
- **Staff roles (branch feat/roles-groups-2026-11-13):**
  - `staff-roles.ts` holds ready roles in six categories: management, sales and register, service and support, finance, content, partners. The new ones are `cashier`, `chat-agent` and a renamed `form-specialist` («کارشناس فرم و خدمات»).
  - rbac presets are derived from it, with the same permission lists as before.
  - The roles API creates from `{template}` in one click; a custom role needs only a title. GET returns the first six members of each role.
  - `/admin/roles` shows the team's roles with their job, readable permissions and members, ready roles by category («افزودن این نقش» / «ساخته شده», hidden while their module is off) and a custom role form.
  - Member groups are renamed and point to roles. The cashier and form specialist roles were made in the owner's local database through the page itself; they have no members.
- **IA, same branch:** content shared tools split in two; CRM engagement and automation moved to Marketing; System settings split into basic settings and updates and data; the users list has one name.
- **Evidence:** tsc; the layout and manifest tests listed above pass. Remaining failures are environmental only: the app copy lacks `deploy/ubuntu/git-build.sh` and `xray-config.cjs`. Browser checks as owner covered the roles page (1440 light, 390 dark, axe 0, no overflow), the tools directory, and the Sales and desk screens. Not run: the Admin as a cashier or form specialist; creating staff users in the owner's database was refused.

## Next slices (in order)

1. **Discount codes guard.** `/admin/promotions` and its API ask `plans.manage`, a VPN permission, so a store manager (`orders.manage`) cannot reach store coupons. Give promotions their own permission (`promotions.manage`) or accept `orders.manage` for store-channel codes. Existing roles must keep access, with a role-migration test.
2. **Live chat permission typo.** `plugins/livechat/manifest.json` lists `tickets.manage`, which is not a permission (the core one is `tickets.handle`). Decide with the owner whether ticket handlers should see chat, then fix the manifest and its API guard together.
3. **Team directory.** Add a list of staff (role ADMIN) grouped by role, with role change and «افزودن کارمند» (an existing account by mobile or email). Merge «مدیران و نویسندگان بخش‌ها» into it as a tab. Reuse the users API's `accountChangeRefusal`, add a `roleId` filter to the users list, and audit every change.
4. **Section menus.** Every content manifest's items should follow one order: dashboard, items, add, taxonomy, home page, settings and address. Settings history links should not repeat under every item.
5. **Single-link groups in Marketing** (SEO, popups, links) and **AI** («فروش و مشتری»): fold them into neighbours through their manifests or order, without changing addresses.
6. **Website and services:** the form builder sits under Website while service work is under Sales. Add a link from «خدمات» to the builder for service forms; do not move the builder.
7. **Run as each ready role** once the owner provides test accounts: cashier, form specialist, order specialist, chat agent, section managers. Record what each sees.
