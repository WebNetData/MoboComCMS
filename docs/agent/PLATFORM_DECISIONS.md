## MoboCom builder "Elementor Pro" — owner 2026-11-09

Owner wants free hands everywhere with AI over API or personal Chat web. Rules: AI returns code as data for a sandboxed preview and explicit insertion; saving keeps `SCRIPT_PERMISSION` (settings.manage) and approval. Advanced CSS is global, so generated code is scoped (`mc-x-…` root, `selector` for element CSS, `.cc-<id>` for components). Site-wide code never runs on Admin, API, auth, install, builder preview, maintenance or popup frames and has a master switch plus `SITE_CODE_DISABLED=1`. Components: admins write code, page builders only fill typed, escaped field values; packages add declarative components without JS through the package sanitizer. Archive/search/404 templates frame the owner's real output in the `surface-content` slot. Builder popups are served by an audience-checked frame (additive `SitePopup.templateId`). Scroll effects use one animation list per element and scroll timelines; pointer effects only for a fine pointer; all stop under reduced motion. Handoffs: BUILDER_AI_CODE, BUILDER_CUSTOM_CSS, SITE_CUSTOM_CODE, BUILDER_COMPONENTS, PACKAGE_COMPONENTS, THEME_ARCHIVE_SEARCH_404, POPUP_BUILDER_DESIGN, BUILDER_SCROLL_POINTER_EFFECTS.

## AI Admin area and three AI tools — owner 2026-11-09

AI has its own Admin rail area (`ai`, between Content and Community), not Content → Shared tools. Owner expects it to grow: groups are overview, assistants & generation (extensions join with `group: 'ai'`), sales & customers, providers & monitoring; feature modules may declare `adminMenu.area: 'ai'` (`EXTENSION_ADMIN_AREAS`). Addresses and permissions did not move. `/admin/ai` tabs follow `?tab=`.
Bulk production must be publishable: before save, a deterministic quality report (similar content, internal links, unsourced claims, image/text agreement, per-profile rules magazine/music/film/product/page) is recomputed at save; blocking findings need an explicit audited acknowledgement. No model call, no external fetch. [Handoff](handoffs/AI_PRODUCTION_QUALITY.md).
Smart sales is read-only over existing CRM/Store/Automation owners; it never sends. Campaign results count paid orders within 7 days after a marketing notice (last touch) against opted-in non-recipients, labelled association not cause; opportunities show counts only. AI campaign copy is text only. [Handoff](handoffs/AI_SMART_SALES.md).
Site operations groups recorded errors with sanitized signatures and a closed cause list; actions are a settings link or a hand-off to Engineering (isolated development + PR, fixed repairs, release only with owner approval). Failed AI calls map to the AI service, never a server repair. [Handoff](handoffs/AI_SITE_OPERATIONS.md).

Chat agent2026-11-09: bridge0.6.7 waits through transient routing after an owned send before delivery; transient routes never bind or accept a result. Same-message receipt retries recheck nonce/deadline and never invoke generation. Selected-image and transfer-budget behavior is retained. Operator confirms0.6.7 completion. Clean server slugs are merged in PR386; the VPS web update is still required. [Evidence and rollback](handoffs/AI_CHAT_AGENT_RELIABILITY.md).

## Authorized economy AI and manual CI — owner2026-11-08

Owner request supersedes automatic PR checks: `.github/workflows/checks.yml` and browser tests are manual-only. Use scoped local evidence; no hosted dispatch per PR. Owner merges/deploys.

Explicit `economy` routing extends the existing AI owner: existing authorized connections/pools, OpenRouter `openrouter/free`, verified installed non-remote Ollama model and attested free-only OmniRoute configuration. Ordinary APIs and personal/Codex remain pinned. Only definite auth/quota/rate rejection can advance within the bounded deadline; uncertain output is never replayed. Policy revision/source binding invalidates old batches. No keys/accounts collected from third parties and no unlimited/free guarantee. Bridge0.4 offers personal DOM-only text chat adapters for ChatGPT/Gemini/Qwen/DeepSeek, images still ChatGPT; session stays in browser. [Contract](../specs/chat-web-production/ECONOMY.md), [evidence](handoffs/AI_ECONOMY.md).

## Separate bulk generation transport — owner2026-11-08

2026-11-08 continuation: [Standard production targets](../specs/chat-web-production/STANDARD_MODELS.md) extend the existing AI batch owner. Text and image targets are explicit per batch, with API/resource consent, server-resolved encrypted credentials and pinned destination; API never resolves personal ChatGPT/Codex or falls back to another provider. Qwen/DeepSeek join the existing API registry and AI egress purpose; custom endpoints support local models. Images optionally use the dedicated OpenAI-compatible base64 image route, not text-only models or arbitrary URL downloads. One API step claims version/lease before I/O and completes through canonical draft/Media owners. Bridge0.3 uses bounded shared DOM readiness, fresh owned tabs, one send, explicit Chat selection and visible manual-login/UI failure; old stored batches remain Chat-driven. Model/provider overrides require settings.manage; section staff use only their assigned production API/model, rechecked each step. No migration, dependency, production deploy or free/unlimited claim.


Owner requests bulk posts/products and generated cover/inline pictures from personal Chat web inside Admin, while assistant/engineering keep current ChatGPT/Codex routing. Extend the accepted personal desktop bridge; never claim unlimited/free usage or invoke API/Work as fallback. Existing target permissions, Media/Library and canonical draft creation remain; exact product facts/price/stock are human input. Browser-driven production persists progress but does not pretend to run without the browser. Failures require explicit retry; reviewed save is DRAFT/inactive with atomic receipt. [Scenario/evidence](handoffs/AI_PRODUCTION.md).
 Recovery extends the same owner with bounded origin/panel/provider/prompt/operation receipts, whole-turn extraction and separate images in one conversation per item; fresh generation remains explicit. [Recovery contract/evidence](handoffs/AI_CHAT_RECOVERY.md).

## Personal Chat web writing bridge — owner 2026-11-08

Owner chooses writing inside the MoboCom post form using personal Chat web, explicitly accepts an unofficial browser bridge and account/UI limitations. Use reviewed optional desktop extension/fresh owned tabs, not exported cookies, private web endpoints or a claimed unlimited API. Existing configured API transport remains default; browser choice is explicit, has no paid fallback, and returns suggestions for review/ordinary CMS save. Only the article-writing assistant uses this transport; customer support/engineering never borrow it. Same prompt/parser/sanitizer, canonical identity/permission/module/Origin/rate checks and block-body locks remain. [Scope/evidence](handoffs/CHAT_WEB_BRIDGE.md).

Owner decision2026-11-08: allow multiple API keys for each configured AI provider, using an available key and notifying management about rejection/quota problems. Scope is explicit opt-in within the same provider/model/exact destination; personal ChatGPT failures never purchase API usage. No ambiguous-request replay or external messages. The assistant follows canonical MoboCom skills/architecture and records development in architecture before completion. Existing isolated development, owner merge and exact-artifact deployment approval remain. [Contract](../specs/ai-resilience/SPEC.md).

# MoboCom — Platform decisions in force

Customer engagement2026-11-07: ongoing birthday/offers/winback extends canonical CRM, Identity consent/custom fields, Automation and Notifications. Global default off, affirmative member choice, current guards and same-origin writes; users.manage AND automation.manage for campaign/history administration. Minimal processed AutomationEvent receipts with a nullable unique dedupe key preserve once/cadence/pressure independently of inbox retention; they are not another queue. Existing Store stock/price subscriptions and Promotions money authority remain. [Bounded evidence and rollout](handoffs/CRM_ENGAGEMENT.md).

Customer service ordering2026-11-07: customers can choose/configure/pay/track hosting, servers, domains, foreign payments and paid services within the existing dashboard. Reuse the current Hosting/Store/Forms/Checkout/Billing owners and Admin catalogue/driver controls; canonical access, prices, claims and once-only receipts remain authoritative. Only an external gateway leaves the shell, returning through an owned persisted presentation marker. No parallel checkout, identity, provisioning or permission system. [Contract/evidence](handoffs/DASHBOARD_SERVICE_ORDERING.md).

Decisions the owner made, and rules that came out of the work, **after** the v4 master prompt was written. They are part of the platform's algorithm: read this before working on access, the forum, staff, or the local workflow. The master prompt states principles; this file states what was decided here and where it lives in the code.

Keep it short and current. When a decision changes, change the entry; do not append history (git and `.ai/MOBOCOM_WORKSTATE.md` hold that). Each entry: the rule, why, where, and what guards it.

Last revised: 2026-10-07 (main `7483e01`, PRs #95–#119, and the first slices of the capability map's open gaps).

---

## Site identity and specialist homepages — 2026-11-06

Owner wants all site identity configurable in Admin and optional professional homepages for hosting/domains/servers, news, store, music, cinema/series, software and games. Preserve the current home by default. Extend the existing brand/Studio/SEO and Theme Builder owners; do not fork the platform or introduce another home/theme/settings authority. Creating a draft never changes live home; explicit selection publishes/places it, retains previous documents and permits return to the original builder/default. Settings + page permissions govern home selection, strict current Settings/index claims and audit protect concurrent work. Choosing a design never activates/deletes modules or changes staff access. Disabled/maintenance solution modules preserve the selected document and fall back to the original home. [Operation and evidence](handoffs/SITE_IDENTITY_HOMEPAGES.md).

## Operational AI defaults to review; direct execution is per request — 2026-11-06

Owner now also requests occasional execution without proposal approval and explicitly chooses «برای همین درخواست، با انتخاب خودم». Review remains the default. Settings manager must enable direct execution per tool (default empty); the requesting admin explicitly selects it for one instruction and retains current section permission. The checkbox resets on submission. Stored request keys/mode, owner/version claims and atomic receipts preserve once-only execution; review proposals cannot become direct actions. No always-on or scheduled AI authority, payment/refund, customer messaging or arbitrary code is granted. Existing Automation remains the unattended-rule owner. [Current contracts and evidence](handoffs/AI_DIRECT_REQUESTS.md), [base owners](handoffs/AI_OPERATIONS.md).

## AI service/model per purpose — 2026-11-06

Owner requests independent providers/models for each application, for example Gemini support and personal ChatGPT Admin. Existing shared configuration remains the inherited default. Public support and Prompt Master never use an admin’s personal grant; Admin child purposes may inherit Admin or explicitly select their own API/personal route. Explicit API bypasses personal; failures never switch provider. Provider/endpoint changes never forward a retained old key. [Behavior/evidence/operation](handoffs/AI_ROUTING.md).

## Personal ChatGPT for Admin — 2026-11-06

Owner choice: their own ChatGPT account serves personal Admin tools only. Each authorized admin has a separate connection; users, Livechat, Prompt Master and background work never consume it. Public support answers concern MoboCom only. Use the documented personal OSS/self-hosted OAuth path and explicit consent, never imported browser sessions. Active personal errors do not fall back to a paid API; explicit disable/disconnect returns to existing configured AI. No hosted shared-account service is authorized. [Implementation and limits](handoffs/CHATGPT_ADMIN.md).

## Content PDF editions — 2026-11-05

Owner requests native downloadable PDF editions across public content/products and dedicated per-kind designs, with an Admin-selected watermark. Existing Content owns the authorized export projection and typed presets; Settings/history/Identity/Media remain canonical. Film and series assignments are independent; interactive media stays online and restricted content requires its existing access. Code-owned templates never execute administrator-supplied HTML/CSS/JS. [Implementation and evidence](handoffs/CONTENT_PDF.md).

## Hosting and cloud — 2026-11-04

Owner: sell hosting and infrastructure of the ParsPack class, looking and working better. Decided:
- **One account, one member dashboard.** Hosting, servers and domains are an area of the existing member shell, with a workspace per service; no second dashboard or account. Wallet, invoices, tickets and notices stay where they are.
- **A new `hosting` module** (off by default, permission `hosting.manage`, admin area *commerce* (Sales)). It is not `server-panel`, which manages MoboCom's own server. VPN's `Plan`/`Panel`/`Subscription` stay VPN's.
- **Families:** web panels cPanel/WHM, DirectAdmin, HestiaCP, ISPConfig, Virtualmin GPL, CloudPanel; registrars IRNIC plus international registrars that accept Iranian resellers (the owner verifies each; none is assumed); compute through a provider's API (first Hetzner Cloud, with the owner's account) **and** directly to the owner's virtualizer (Proxmox VE first, then XCP-ng/Xen Orchestra, OpenNebula, CloudStack, Virtualizor, VMware, SolusVM, OpenStack), **and manual sale**: staff hand over IP, username and password, the customer has no controls, and buys extra traffic or an upgrade only where staff switched that on. A stopped cloud server still pays for disk and IPs. One contract per family; a driver declares its capabilities and the workspace shows only those.
- **Products:** shared, reseller, VPS, dedicated, cloud server, cloud hosting. **Cycles:** hourly for cloud, and monthly, 3, 6 and 12 months for every service.
- **Hourly is prepaid from the wallet**: one charge row per service-hour, unique, with the wallet idempotency key; zero balance powers off and keeps data until the retention days pass. Fixed terms renew by invoice, from the wallet only when the member turned it on.
- **The customer has the full controls the driver offers** (power, reset, rebuild, password, console, snapshots…), each an audited, idempotent action on their own service only; destructive ones need a fresh confirmation.
- **Renewal (slice 3):** a fixed term renews by one more term from its due date at the price it was bought for. Iranian gateways keep no card, so the customer pays from the service page, or the wallet pays a day before the due date when they turned that on; no unpaid invoice is issued ahead. Defaults: reminders 7, 3 and 1 days before, suspension 3 days after the due date, termination 14 days after that, with a warning 3 days before. Only the system's own unpaid suspensions are terminated automatically; a staff suspension is staff's. Money for a renewal that arrives after termination goes back to the wallet.
- **Hourly (slice 5):** bought without checkout or prepayment; the wallet must cover the minimum hours (24 by default). Each completed hour is one wallet movement and one charge row, unique per service and hour, the hour in progress charged in full only when the customer deletes. The wallet never goes negative: an hour it cannot pay suspends the service; a top-up resumes it and the suspended hours are not charged. A stopped server pays its disk and IP rate.
- **Add-ons:** extra traffic and upgrades are bought on the service page through checkout, only where the product (or a per-service switch, which wins) allows them. An upgrade costs the price difference for the time left in the term and moves the renewal price; an hourly service upgrades without payment. Where staff deliver by hand, a paid add-on becomes a task they mark done.
- **Domains:** one live registration per name (database rule); the customer pays first and staff register at the registry until a registrar driver exists; if the name cannot be registered the order is cancelled and refunded in full to the wallet. Availability comes only from fixed public lookups (IRNIC WHOIS, RDAP); an unreadable answer still allows the order. Renewal adds years to the expiry date; a .ir domain needs the customer's IRNIC handle.
- Spec, slices and open choices: `docs/specs/hosting-cloud/SPEC.md`.

## Server installation, update and downgrade — 2026-11-03

Owner: installing on a server must be one command on Ubuntu 22.04/24.04/26.04, Debian 12/13 and AlmaLinux 9/10, and update and downgrade must be just as easy. There is still one installer, `deploy/ubuntu/install.sh`. The OS differences live in `deploy/ubuntu/platform.sh`, which the installer sources from its own trusted bundle, and the signed `.run` bundle carries it too:

- packages: apt or dnf, plus EPEL/CRB;
- Node 22: NodeSource, or the AppStream module;
- PostgreSQL 17 from PGDG;
- Redis, or Valkey where the system ships no Redis;
- firewall: ufw or firewalld;
- the nginx `sites-available`/`sites-enabled` layout, joined through `conf.d` on AlmaLinux;
- the certbot timer name;
- `sudo`'s search path.

On AlmaLinux, SELinux stays enforcing; only `httpd_can_network_connect` is enabled. Any other system is refused before anything is changed.

`install.sh` at the repository root is the one-line entry (`curl … | sudo bash`). Its body runs only once fully downloaded. It fetches over HTTPS from github.com into a private root folder and runs the installer from there. With `update`, `downgrade VERSION`, `versions` or `status`, it acts on an installed site. It replaces the root-owned `mobocom` command only with one whose `HELPER_VERSION` is higher.

Released versions are Git tags `vX.Y.Z`. `mobocom update VERSION` and `mobocom downgrade VERSION` reuse the existing safe path of `update.sh`: backup first, an exact commit, build, health check, and automatic return on failure. A downgrade changes code only; the database is never rewound, and data goes back only through an explicit `mobocom restore`. Signed-package sites keep updating through `/admin/updates`. [Evidence and limits](handoffs/HOST_INSTALL_UPGRADE.md).

Restricted networks (owner's server, 2026-11-04): github.com reachable; raw/codeload, apt/download.postgresql.org, registry.npmjs.org, binaries.prisma.sh and Let's Encrypt blocked. Per host and automatically, with `--mirrors`/`--no-mirrors` to decide:

- **PostgreSQL** comes from `mirrors.aliyun.com/postgresql`. The PGDG key is accepted only with fingerprint `B97B0AFC…ACCC4CF8`.
- **npm:** `deploy/ubuntu/npm-registry.sh` runs as the service user before every `npm ci`. It keeps a mirror that answers, else takes the first of Runflare, Liara and Huawei Cloud that does, and removes the setting once the official registry answers again. Integrity still comes from `package-lock.json`.
- **Prisma's engines** come from the repository's `prisma-engines` branch. `deploy/ubuntu/prisma-engines.sh` runs as the service user before every `npm ci` (install, `update.sh`, `package-update.sh`). It checks the engines against `deploy/ubuntu/prisma-engines.txt` and places them in Prisma's cache, so Prisma copies them and downloads nothing. A Prisma upgrade must add its engines to the branch and the pins in the same release; `installer.test.cjs` fails otherwise.
- **The entry command** where raw is blocked is a `git clone` from github.com.
- **Let's Encrypt:** when it is unreachable, the installer says so and the operator uses the existing PEM import.

Social-network proxy (owner, 2026-11-04: "put Xray-core in the system so the Telegram bot/mini app and social publishing can reach Telegram and Instagram through a config I set"):

- **Running:** Xray-core runs as `mobocom-xray.service`, under its own unprivileged user and a hardened unit, as an HTTP proxy on `127.0.0.1:10809` only. It is off until an outbound is applied.
- **Fixed by the root builder:** the Server Panel's "پروکسی شبکه‌های اجتماعی" sends one outbound, parsed from a share link or outbound JSON in `social/domain/xray-link.ts`. Root-owned `xray-config.cjs` builds the rest: the listener, a log without access lines, and routing. Telegram and Facebook/Instagram domains go through the outbound; everything else is blackholed.
- **Applying:** `mobocom-xrayctl` (the site's only sudo rule for it) applies a configuration only after `xray run -test`. It reports running only once the port accepts connections.
- **The site's use:** `socialFetch` (`social/server/egress.ts`) tunnels only `api.telegram.org`, `graph.facebook.com` and `graph.instagram.com` (CONNECT, then TLS with the host's own certificate checks), and only while the setting `social.proxy.v1.enabled` is on. Every Telegram/Instagram call site uses it.
- **Storage and audit:** the link is stored encrypted; the audit records the protocol and server only.
- **The binary:** pinned in `deploy/ubuntu/xray-core.txt` (Xray's own SHA-256), from the official release, or from the `xray-core` branch where release files are blocked. It is installed by `install.sh`, optionally: a failure never stops the site's install.

Server Panel switch (owner, 2026-11-04: "turn the server panel on with one command"): `sudo mobocom panel on [--ip IP[,IP…]|--any-ip] | off | status`, also through the one-line installer's `panel` action. It sets `SERVER_PANEL_ENABLED` and `SERVER_PANEL_ALLOWED_IPS` in the environment file (one line each; every other line, the owner and the mode are kept; the IPs are validated; the file is replaced in one step), then restarts the site and waits for health. Without `--ip` it suggests the SSH client's IP. The panel's own "switched off" page names the command.

## Digital files and content pricing — 2026-11-03

Store owns file products and orders; Paywall owns priced content, now including Prompt. Account owns exact integer PRICE/PERCENT/AMOUNT/FREE adjustment math. Lowest eligible ordinary/VIP/current-group price wins without stacking. Free eligibility is live, while a paid purchase survives group expiry and closes on its applicable refund. Only FILES virtual fixed-price non-service products may have zero Store prices. Media stores opaque private bytes outside public Library roots; copying an existing Library file is explicit and leaves its original public. Current section managers price through existing permissions, with owner-row/revision/audit claims. No second catalogue, grant system or identity. [Owner interfaces, rollout and evidence](handoffs/DIGITAL_CONTENT_PRICING.md).

## Membership groups and VPN — 2026-11-03

Custom membership/VPN2026-11-03: a canonical user may belong to several custom groups at once; their Identity Role remains independent. Per-user membership saves use an exact user-bound revision and the same row lock as existing per-group commands, with strict transactional audit; retained expiry/notes survive. VPN uses the existing section policy and exact `plans.manage` + `subs.manage` manager authority: choose VIP, group(s) or their union, with current standing/expiry/module state checked server-side. Omitted section-setting fields preserve current restrictions; an explicit empty array opens that section. Module activation and already issued external VPN accounts are separate, never implicitly changed by this rule. [Owner paths and boundaries](handoffs/USER_GROUPS_POPUPS.md#vpn-audience-and-user-multi-membership--2026-11-03).

## Mobile registration and recovery — 2026-11-03

Ordinary `/register` uses mobile OTP, then the existing Welcome step asks for first/last names and a new password; email is optional. Identity owns the additive `User.passwordSetupRequired` marker, false for old rows and true only for newly created mobile users. Initial password creation claims the pending, active verified-mobile account and its unchanged snapshot in one transaction; ordinary profile completion never changes passwords. Existing password, Telegram/referral and email-code APIs remain compatible. Password login matches a unique verified normalized mobile or email and retains the same TOTP/current-standing checks. Recovery stays with existing SMS OTP/email-link owners; password writes clear the marker and revoke previous sessions. Settings remain `/admin/sms`, `/admin/email`, `/admin/security`, `/admin/profile-fields`; additional owner-defined fields follow the fixed first-use requirements. [Continuation and deployment](handoffs/PASSWORDLESS_ENTRY.md#mobile-first-registration-and-password--2026-11-03).

## Prompt Master — 2026-11-01

Member integration2026-11-02: Account owns the dashboard composition; Prompts projects bounded current-member history metadata, Reviews owns template favorites and Content owns collections. `/dashboard/prompts` composes the existing private-history UI and keeps `/prompts/history`. Invalidation carries no private text/identity; each reader reauthorizes through its canonical owner. `prompts.manage` joins the existing shared editorial-collection manager set, while `prompts.author` remains own-template only. No second account, list storage, identity mapping, or public item type for private generations. [Continuation](handoffs/PROMPT_MASTER.md#member-dashboard-and-shared-library--2026-11-02).

`prompts` owns instructions/templates/history only. Reuse the existing AI provider and shared services; structured mode makes no provider call. AI enhancement is default-off and needs a current member, explicit input consent and strict quotas. Public template favorites use existing Engagement; private pinned outputs are retained history, never public content. Template URLs remain stable after creation. Public showcase metadata is prompt-owned presentation; Media owns bytes/access. WEB samples use fixed compositions or Library images, never arbitrary stored HTML/JS. Exact sample prompts and provenance remain visible; no fabricated provider/popularity claims. Control Plane owns switches/limits; `prompts.manage` does not imply `settings.manage`. [Contracts, checks and migration](handoffs/PROMPT_MASTER.md).

## Web operations — 2026-10-31

Profile imports2026-11-02: Imports owns parsing/mapping/jobs/provenance; Prompt/Celebrity/Business owners retain validation and transactional writes. New destinations require imports.manage plus prompts.manage, both music.manage and cinema.manage for the shared artist, or businesses.manage, with current authority/module checks through execution and undo. Preserve existing slugs/domain/seller bindings; no private generation or human/representative/trust assignment. New prompt/business rows default DRAFT; central artists have no draft state. [Contract and exact evidence](handoffs/IMPORTS_LAUNCH.md#profile-destinations--2026-11-02).

Bulk import continuation: HTML may create/edit legacy bodies, but never replace or undo over a canonical block body; selected metadata is independent. Preview refusal is backed by a transactional format/timestamp claim at apply/undo. Fresh content-job metadata chooses draft; old saved-job normalization and explicit mapped statuses retain their meaning. [Exact contracts and evidence](handoffs/IMPORTS_LAUNCH.md).

Fresh web installation requires a private capability in production and closes after the first owner; use existing Installer and serialized PostgreSQL owner creation. Installed-site operations remain behind Server Panel opt-in, canonical permissions, origin and password/TOTP/IP unlock. Database backup and updates compose their existing owners under that panel; no general SQL writer, public Adminer or arbitrary privileged command API. SSL reuses existing encrypted DNS credentials and a fixed private PEM helper; manual certs require manual renewal. Updates preserve dirty/divergent owner code by refusing it, retain backup-first/health/rollback, never force checkout or rewind the DB, and never steal an aged lock. [Contracts, evidence and activation limits](handoffs/WEB_OPERATIONS.md).

## 1. Product focus and module switches

- **Focus surfaces:** Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN sales, resellers and the seller marketplace are set aside for now (owner, 2026-10-06).
- **A switched-off module disappears from the admin menu and its APIs close; its data stays.** `reseller` is its own module and requires `vpn`.
- Where: `src/plugins/*/manifest.json` (generated catalog: `npm run extensions:generate`), effective state with `requires` in `src/extensions/server/state.ts`, `whenModuleOn(id, handler)` in `src/extensions/server/modules.ts`, `src/modules/notifications/domain/event-modules.ts`. Spec: `docs/specs/module-switches/SPEC.md`.

## 2. Authorization: section-specific permissions

- **Every part of the site is opened by its own permission and by nothing else.** There is no shared "content" permission.

| Permission | Opens |
|---|---|
| `cms.posts` | The magazine only: posts, post categories, article comments, journal, post templates, newsletter, editorial collections |
| `music.manage`, `cinema.manage`, `games.manage`, `software.manage` | That section's admin, media library, categories, paywall, menu and manage bar |
| `cms.products` (+ `orders.manage`) | Store products (and orders) |
| `forum.moderate` | Forum admin and moderation of every forum |
| `reviews.moderate` | Ratings and reviews of content |
| `games.manage` **and** `cinema.manage` | Studios (shared by both catalogues) |

- Until migration `20261203120000_posts_permission_is_the_magazine`, `cms.posts` also opened music, films, games, software, forum and review moderation. That migration gave every role holding it those six permissions, so nobody lost access. **Never accept `cms.posts` in a new guard unless the thing guarded is the magazine.**
- Guard: `scripts/account-security.test.cjs` holds the exact list of files allowed to name `cms.posts`; a new file fails the test until it is reviewed and listed.
- When a plugin adds a section: declare its own permission in the manifest, use only that in its guards and menu, add it to `SITE_SECTIONS` if it should be delegable, and to `CONTENT_EDIT_PERMISSIONS` if its editors upload pictures.
- Where: `src/modules/identity/rbac.ts` (`PERMISSIONS`, `ROLE_PRESETS`, `FORMERLY_OPENED_BY_POSTS`, `CONTENT_EDIT_PERMISSIONS`), `src/modules/identity/server/access.ts` (`requirePerm`), `src/modules/identity/server/admin-guard.ts`. Spec: `docs/specs/manage-bar/SPEC.md`.

## 3. Staff: who may change whom

- An account has **one role**. Staff without a role (`role = ADMIN`, `roleId = null`) is **full access** — the owner. Therefore: *standing and role always change in the same write; never leave an account as staff without a role.*
- Rules, enforced for every route that changes an account (`accountChangeRefusal` in `src/modules/identity/server/staff-guard.ts`):
  - giving or taking staff standing needs `roles.manage`; `users.manage` is for customers' accounts;
  - full access is given, and a full-access account changed (role, status, password), only by full access;
  - a staff account's password or status needs `roles.manage`;
  - nobody changes their own standing.
- A role is made or edited only within its editor's own permissions, never to full access, never the role the editor holds (`roleRefusal` in the roles route). Role changes are audited.
- **Any new route that sets `role`, `roleId`, `status` or `passwordHash` of a user must call the guard.** A unit test counts the calls in the existing routes.
- Known gap: the reseller admin route sets passwords and is not behind the guard yet.

## 4. Managers of site sections

- The owner names a manager per section from **`/admin/section-managers`** (needs `roles.manage`). No role is built by hand: a choice of sections stands for one role, `sections:<ids joined by +>`, holding `dashboard.view` and exactly those sections' permissions; it is reset to exactly that on every assignment.
- Sections: `prompts`, `businesses`, `magazine`, `music`, `cinema`, `games`, `software`, `store`, `forum`, `reviews` (`SITE_SECTIONS` in `src/modules/identity/domain/sections.ts`). No section may carry `users.manage`, `roles.manage`, `settings.manage`, `finance.manage` or `extensions.code` (unit-tested).
- Hand-made roles (support, accounting) and full-access accounts are shown there and changed only in the role form.
- Where: `src/modules/identity/server/section-managers.ts`, `/api/admin/section-managers`. Spec: `docs/specs/staff-teams/SPEC.md`.

## 4A. Authors of site sections (owner, 2026-10-12)

A staff group whose only job is to post in one section: magazine, film and series, music, games, software. Spec: `docs/specs/section-authors/SPEC.md`.

- **A second, narrower key of the same section**, declared by the section's own plugin: `journal.author`, `cinema.author`, `music.author`, `games.author`, `software.author`, `prompts.author`. It is never accepted where the section's permission is asked. The two content owners take it only through `requireContentScope(req, manage, author)` (`src/modules/identity/server/access.ts`), which returns the caller as a manager (`authorId` null) or as an author (their own id). No shared content permission, no second resolver; plugin permissions are not core ones, so no stored full-access role changes.
- **Own items only.** The owner of an item is who created it: `Post.authorId`; `createdById` on `MusicArtist`, `MusicAlbum`, `MusicTrack`, `CinemaTitle`, `GameTitle`, `SoftwareTitle`, `PromptTemplate` (written once by the admin form; legacy media imports record none, while the Prompt template importer records its current managing actor). For an author every list, count, single read, save, block-editor document and batch is narrowed to those rows, and someone else's row answers 404. Items made before this have no recorded creator on the media models and belong to no author. Artists are shared names: an author reads all of them, edits the ones they added and deletes none.
- **An author never deletes.** Their delete is a claim that sets `status` to `TRASHED` and keeps what it was in `trashedStatus`, with `trashedAt` and `trashedById` (`src/modules/content/domain/trash.ts`). Public readers ask for `PUBLISHED`, so the item leaves the site at once without any reader being changed. In the trash nothing is edited, by anyone. The section's manager or the owner deletes it for good (the delete that already existed) or restores it (`PATCH { id, restore: true }`) to the status it had. The database holds the rule (`<Table>_trash_state` checks, migrations `20261224120000_section_authors` and `20261225120000_game_authors`); `TRASHED` is not a status a form may send, and a status batch leaves trashed rows alone.
- **Naming an author** is `/admin/section-managers` (`POST { email | userId, sections, as: 'author' }`), with the same refusals as for a manager; the role is `authors:<sections>`, found or made for exactly those sections. The page may turn a manager into an author and back; full-access and custom roles are not changed from there.
- **Where a manager sees the requests:** on the section's own list (a trashed row shows «بازگردانی» and «حذف نهایی») and in the staff overview under `trash-posts`, `trash-cinema`, `trash-music-tracks`, `trash-music-albums`, `trash-games`, `trash-software` (one source per kind of item, because a case is keyed by source and id).
- **What an author does not get:** categories and taxonomy management, comments, history, newsletter, AI autofill, paywall prices, collections, imports, section settings, featuring an article. They upload pictures and files for their own items.
- **Magazine review (2026-10-25, spec `docs/specs/journal-review/SPEC.md`).** A magazine setting, off by default, which keeps the earlier behaviour: «نوشته‌های نویسندگان پیش از انتشار بازبینی شوند» (`journal.home.v1.reviewAuthorPosts`). While it is on, a `journal.author` drafts or sends an article for review (`Post.status = PENDING`, never public). Every writer refuses that author a publish and any change to a published article: create, save, batch and block editor. The `cms.posts` manager approves (a past publication time becomes now, a future one stays its schedule) or returns the article to draft with a note. Each decision is a compare-and-set on `PENDING` and records a version, an audit row (`cms.posts.review.*`) and an Inbox notice (`POST_REVIEW`). Waiting articles show on the dashboard, in the list's «در انتظار بازبینی» filter and in the staff overview (`review-posts`). Only `DRAFT`, `PENDING` and `PUBLISHED` come from a form. Since 2026-10-26 an author's save of their published article (review on) becomes that article's single open proposal (`PostEditProposal`). It carries only changed words, cover, categories and (since the 2026-10-26 canonical-body continuation) a validated MoboCom contentDocument, never status, time or address. Body proposals are explicit, share the existing metadata proposal, and require exact live-base/proposal tokens; the manager has a guarded full comparison. Editor validates submission/application, regenerates HTML and preserves unknown blocks. A stale canonical base cannot be applied or silently rebased. See handoffs/JOURNAL_BLOCK_PROPOSALS.md; original plugin settings and the no-live-overwrite author rule remain. The manager applies it, with compare-and-set on the proposal it read, a version, an audit row and a notice, or rejects it with a note.
- A new kind of item an author may write joins `AUTHORED` in `src/modules/media/server/admin.ts` (or gets the same scope in its own owner), a `createdById` column, and — if it has a status — the trash columns and check.
- **Games have an admin of their own** (`src/modules/games/server/{admin,http/routes}.ts`, `/admin/games`). A games author gets the list of their own games (`adminGames(…, scope)`), its batches without featuring or the editors' choice (`bulkGames`: their delete is a trash request, `restore` is the manager's), the editor through the shared media owner, and the updates/DLC of their own games (`gameFor`). The dashboard, the release plan, franchise changes, studios and the settings stay the manager's; the shell shows an author the games tab only.
- Guards: `scripts/account-security.test.cjs` (role rules, where an author permission may be named, trash rules), `scripts/moderation-queue.test.cjs`, `e2e/tests/section-authors.spec.ts` (real routes and sessions on PostgreSQL).

**Prompt Master extension (2026-11-01):** the same section-manager page assigns `prompts.manage` or `prompts.author`. Templates use canonical nullable `createdById`; old creator-null rows are manager-only, never backfilled by guessing. The module owns version-claimed drafts/pending/publication and the shared Content trash/restore rules; existing Moderation has `review-prompts` and `trash-prompts`. Its Control Plane `review-authors` defaults on for this new author capability; authors submit for manager review and cannot overwrite published work while on. Off permits own publication; curation/settings/permanent deletion stay with managers. Creator names/pictures use canonical Identity, with the existing library author filter. [Exact owner, migration and evidence](handoffs/PROMPT_MASTER.md#section-team-and-authoring-continuation).

## 5. Manage from the page

- Public item pages (post, film/series, song, album, artist, playlist, game, software, product) show staff a small bar with "edit" straight to that item: `src/components/admin/ManageBar.tsx`.
- **The bar decides what to show, never what is allowed.** The panel and its API check the permission again. Visitors and customers get nothing and no request is made for them.
- Admin editors open one item from a link: `?edit=<id>` on `/admin/posts`, `/admin/cinema/titles`, `/admin/software/titles`, `/admin/music/library?tab=tracks|albums|artists|playlists`; games and products have a page per item.
- A new public item page gets a `ManageBar` with its section's permission; a new shared editor honours `?edit=`.

## 6. The forum (Invision-class, with a social layer)

Owner's direction (2026-10-06): a board as capable and good-looking as Invision Community, with the social network built in. That decision permitted the forum redesign on the site's tokens. **Superseded for future visual changes on 2026-10-10:** the current Community/Forum design is now protected, alongside Software, Store and the previously protected surfaces; enhance within its established identity. Spec with every slice: `docs/specs/forum-invision/SPEC.md`.

**Structure**
- Three levels: **section → forum → subforum** (`MAX_CATEGORY_DEPTH`, `categoryTree`, `categoryFamily`, `categoryPath` in `src/modules/forum/domain/tree.ts`). No schema beyond `ForumCategory.parentId`.
- **A section takes no topics** (a top-level category that holds forums): not offered by the composer, refused on create and as a move target, for staff too.
- A forum is sized and dated over itself and the subforums *the viewer may see*; a hidden subforum adds nothing to its parent (counts, last post, breadcrumb).
- Every list that shows the tree walks it with `categoryTree` (composer picker, sidebar, move dialog, admin table). Do not write another two-level walk.

**Team: three ranks, each a name for access that already exists**

| Rank | Access behind it | Set where |
|---|---|---|
| مدیر کل تالار (`admin`) | staff holding `forum.moderate` | section managers page, section "forum" |
| معاون تالار (`deputy`) | member of a group with `moderator = true` (group `deputies`) | forum admin → تیم تالار |
| مدیر انجمن (`moderator`) | `ForumCategoryModerator` row: that forum and everything under it | forum admin → تیم تالار, or the category form |

- `Viewer.moderator` = moderates everywhere; `Viewer.moderates` = forums assigned. **`inCategory(viewer, categoryId)`** gives the viewer as they stand in one forum; every entry point that loads a topic or post applies it. New forum code must not test `viewer.moderator` on a topic or post without going through `inCategory` / `moderatesCategory`.
- An assigned moderator moves a topic only into a forum they moderate or could post in; posts only into a topic of a forum they moderate. They have no access to the admin panel.
- Rank is shown beside posts, on the profile, in the member list and on `/forum/staff` (`forumRanks`, `forumTeam` — the public page names no forum the viewer may not see).
- Where: `src/modules/forum/server/team.ts`, `actions.ts`, `moderation.ts`, `community.ts` (`viewerFor`).

**Ranks and what stands under a name (owner, 2026-11-03)**

- A member's standing is a *rank* (مقام), kept in the forum settings as `levels`. The owner creates, orders and deletes ranks in forum admin → مقام‌های کاربری. It extends the earlier levels; it is not a second system.
- A rank asks for any of seven numbers (posts, likes received, reputation, topics, accepted answers, days visited, days since joining; zero asks nothing) and is earned by all of them or by any one (`match`). A rank can be given by hand alone (`manualOnly`). A member holds the last rank in the list they earned. A rank stored before these fields keeps its meaning: all conditions, automatic.
- It is worked out when an author is read (`levelFor`), so a changed rule holds for every member at once and needs no job.
- Staff change a member's rank in forum admin → کاربران (`ForumProfile.manualLevelId`); a rank given by hand wins until it is taken back or deleted.
- **A rank shows standing and opens nothing.** Access stays with the team above, trust levels, forum groups and site groups. So the team is not a kind of rank: the two are shown side by side.
- Under a name stand two boxes (`MemberBoxes`): the group, then the rank. The group is the first of the member's shown site groups in the admin's order (`UserGroup.showBadge`, `sortOrder`), else VIP, else the forum group they chose, else «کاربر عضو». Staff get no plain box. A site group that should stay private is hidden in its own editor. Shown beside posts, on the profile's forum part and in the member list.

**The forum admin (2026-10-26, owner: "every section principled, tidy and specialised")**
- It sits in the shared section frame (`sa-tabs`, `sa-head`, `sa-card`, `sa-table sa-cards`), like the magazine, cinema and store. Each tab is an address (`/admin/forum?tab=…`), so the admin menu, the staff queue and the back button land on it. The community pages use `SectionShell` itself.
- Structure is one tree (section → forum → subforum, sections highlighted); a row adds the next level inside itself. Club forums are listed apart (they belong to their club and are not deleted here). Groups are split into the team's, the automatic ones and clubs; members are added from a group's row. Badges are granted from their row.
- Forms open on demand (a new item, or the row being edited) and close after saving; nothing stands open above a list.
- Members are a list to scan (level, activity, sanction) with filters by what needs attention (`GET /api/admin/forum?section=users&filter=restricted|locked|noted`, with counts); a member's controls open under their row.
- Admin pills on the accent take the ink derived for the accent in dark, and white in light, where the admin deepens the accent for text (`admin-tidy.css`). Light pages deepen the kit's warning amber (`--sa-warn`).
- Handoff: `handoffs/FORUM_ADMIN.md`.

**Pages**
`/forum` board index (`server/board.ts`, `ForumRow`), `/forum/c/<slug>` forum page and all topic lists (`TopicListPage`, `TopicList`), `/forum/t/<id>` (`TopicView`), `/forum/activity` (`server/stream.ts`), `/forum/users`, `/forum/g`, `/forum/u/<username>` (`server/people.ts`), `/forum/leaderboard` (`server/leaderboard.ts`), `/forum/staff`, `/forum/clubs` (`server/clubs.ts`). Styles are appended blocks in `src/app/forum.css`, one prefix per area (`fb-` hero and widgets, `bi-` board rows, `fc-` forum page, `tl-` topic list, `tp-` topic heading, `fs-` stream, `fm-` members, `fg-` groups, `fp-` profile, `fl-` leaderboard, `ft-` team, `fk-` clubs).

**Rules that hold across them**
- Everything public is limited to the forums the viewer may see (`visibleCategories`); hidden posts and unlisted topics never count.
- Reputation = one point per reaction from someone else. Leaderboard days turn at midnight in **Tehran**.
- The social side belongs to its owners: following is identity's (`UserFollow`, `/api/people/<username>/follow`), feed posts are community's (`homeFeed`, `ProfileSocial`), reviews are the reviews module's (`recentReviews`). The forum composes them; it never re-implements them. Each respects its module's switch.
- "Who follows whom" is not published as activity: follow lists are private for members who chose so.

**Clubs**
- A club = a forum group (joining, requests, owners) + a forum under the section `clubs` whose access is that group's + the founder as that forum's moderator. Linked by the nullable `ForumGroup.clubCategoryId` (migration `20261204120000_forum_clubs`). Open: everyone reads, members write. Private: members only, joining by request.
- Who may start one is the forum's settings (`clubsEnabled`, `clubsMinTrust`, `clubsMaxOwned`; forum admin → settings); staff are not limited. Clubs have their own page and are laid out neither on the board index nor among user groups.
- The founder **closes** a club (nobody joins, no topic starts, waiting requests are withdrawn; nothing is deleted) and opens it again as the kind it was; closed is `joinMode = CLOSED` with the forum locked, and the kind is read from the forum's permission rows, not from the join mode. The founder **hands it over** to one of its members. A club's forum is moderated by exactly its owners (`syncClubModerators`, also called by the group's own owner toggle).

## 6A. Filing content: more than one taxonomy per section

- The shared taxonomy (`TaxonomyTerm`, `TaxonomyAssignment`; rules in `src/modules/taxonomy/domain/taxonomy.ts`) files a section's items under a tree of terms. **A section may have more than one taxonomy.** Music has two (owner, 2026-10-07): `music` — categories of **albums** — and `music-language` — the language or dialect of a **song** (فارسی، ترکی، لری، مازندرانی to start; more from the admin).
- **One taxonomy, one kind of item.** Assignments are keyed by term and a bare item id, so a taxonomy must never file two kinds of item (albums and songs share ids). A new way of filing is a new taxonomy with its own terms, not a second owner type in an old one.
- To add one: add its id and `TAXONOMY_INFO` entry (label, item word, public base path, module — the module decides the permission, `<module>.manage`); name it in `liveOwnerIds` (which table its items live in); set `taxonomy` on the media resource in `src/modules/media/server/admin.ts`; add the `terms` field to that item's admin form; give it a public archive under its base path; add it to `LEGACY_SOURCES` only if an old free-text field exists to build it from. **Every branch on a taxonomy names it**: an `else` that means "cinema" silently swallows a new one (it did, twice).
- Public: `/music/language` (index), `/music/language/<language>[/<dialect>]` (songs), a link on the song page, a filter on `/music/browse` (`?lang=`, combining with genre, search and order), an entry in the music mega menu (`src/modules/navigation/server/megamenu.ts`). Admin: Categories → «زبان و گویش موزیک», the song form, and the album form's "language of every song in this album" (`trackTerms`: files each song the album holds in the same save; an album has no language of its own).
- A resource whose save changes another taxonomy's counts names it in `alsoCounts` (`src/modules/media/server/admin.ts`).
- Guard: `scripts/music-language.connected.cjs` (counts and lists published songs only; albums and songs with equal ids stay apart).

## 6B. Slices from the capability map's open gaps (2026-10-07)

**Store: free shipping by order size and place (owner, 2026-10-27).** "Orders over 5,000,000 Toman ship free inside our city (Qaemshahr)" is a rule of the carriers (`CarrierSettings.freeRules`, setting `shipping.carriers.v1`, no migration), because only carriers know the address; the flat delivery fee has no address and keeps its single `freeOverRial`.
- A rule has a minimum in Rial (the editor takes Toman), an area (the store's city, its province, listed cities or the whole country, matched without spaces or half-spaces), optional carriers (none = all) and an optional window. `freeRuleFor` picks the lowest met minimum; `quote()` then prices that carrier at zero and names the rule (`freeBy`). At most twenty rules; a rule without a positive minimum is dropped.
- The cart tells the shopper which offers are reached and how much is left for the next (`CartView.freeShipping`, only with carriers on and physical items, only in Rial/Toman carts). Checkout and the admin trial quote show the rule's text under «رایگان».
- Carriers are off and the origin is Tehran by default: the owner sets the origin city and turns carriers on at `/admin/shipping-carriers` for any rule to apply.

**Store: full control of shipping (owner, 2026-10-27).** Every carrier is configured by the owner on the same setting (`shipping.carriers.v1`, no migration). Each carrier has:
- **Routes:** inside the store city, other cities of the province, other provinces, each on or off.
- **Places:** an only-these / all-but-these list of provinces and cities.
- **Pricing:**
  - the zone and weight table;
  - one fixed amount;
  - freight paid by the receiver on delivery (`collect`, «پس‌کرایه»).
- **Hand-set fees** for a city or province (a city beats its province).
- **A fixed extra fee:** packing, insurance, or taking the parcel to the freight office. It is charged now, also with `collect`.
- **An order amount range.**

Other rules:
- A collect carrier is never free: the receiver pays its freight.
- Templates add Mahex, freight (باربری) and bus terminal next to the existing carriers.
- Free rules gain "outside the store city" and "everywhere except listed cities".
- The order keeps `shipping.collect` in its meta; the admin order and shipment panel show it.
- Saved settings keep their behaviour: a local courier stays city-only with its listed cities.

**Store: a delivered code.** A code leaves the shelf once. Taken back from its buyer it keeps its order and is marked returned (`ProductDigitalCode.returnedAt`, `returnId`, `returnNote`; migration `20261206120000`): void, not the buyer's any more, never sold again.
- Staff **replace** a code that did not work from the product's pool screen (`replaceCode`): the old one is void and a code of the same shelf takes its place on the same order line, in one step; the buyer is told without the code in the notice.
- **Sending a code back** is a return like any other, by its own window: `codeReturnDays` in the return rules, 0 (never) by default, because a code the buyer has read cannot be resold and that is the owner's call. Every such request is reviewed by staff; a line gives back no more units than the codes its buyer still holds, and the reasons offered fit what goes back (`reasonsForGoods`). On refund the codes of the returned units are void (`takeBackCodes`, the ones given last first; safe to repeat).
- A **cancellation** of an order whose codes the buyer has already read is never refunded by itself; it waits for staff.
- Stock of a product that sells from its pool is the pool's count, also after stock is returned (`returnStock` → `syncCodeStock`).

**Store: full-width pages and the invoice mark (owner, 2026-10-27).** The cart, checkout and the invoice page take the width of the site header (`--mb-chrome`), like the shop front; this replaces the earlier "cart and checkout keep their own width". The product description and its questions use the whole panel. On the invoice (web and PDF) a logo sits on frosted glass (translucent white with a light edge) instead of a white box; a letter mark keeps its solid chip. The PDF can be looked at with `.mobocom/claude-tools/shot-invoice-pdf.cjs`.

**Store: a professional category tree (owner, 2026-10-27).** "Many categories and sub-categories, fully professional."
- **The ready tree:** `src/modules/catalog/domain/category-template.ts` holds 91 categories in three levels for both stores.
  - Digital: gift cards, subscriptions with AI / streaming / music, software licences, digital games, foreign payment services, tech services.
  - Physical: mobile with accessories, computers with components, networking, audio and video, gaming, smart gadgets, storage.
- **Building it:** the owner builds it at `/admin/productcats` with one press (`POST /api/admin/cms?type=productcats` with `{ template: 'store-v1' }`, permission `cms.products`, audited `cms.productcats.template`).
  - Only free addresses are made, in one serializable transaction: a child goes in its parent's half, a root in its own.
  - A category whose address already exists is kept where it stands, neither moved nor renamed, and is reported when the template would put it elsewhere. A second press adds nothing.
- **The manager** draws each half as a tree with:
  - product counts (with sub-categories) and the number of sub-categories;
  - edit / + sub-category / view on every branch, and a fold button per branch.
- **The form** gains the picture, description and display order the server already accepted. A parent is chosen by its full path. `AdminCrud` opens `?new=1&<field>=…` with those fields filled.
- **Shoppers** are offered only categories that hold products: the stores' category cards as before, and now the sub-categories on a category page too.
- **Evidence:**
  - `scripts/category-template.connected.cjs` (real PostgreSQL);
  - a unit test in `store-v2.test.cjs`;
  - `.mobocom/claude-tools/pw-category-tree.cjs`.

**Store: several categories per product, WordPress-like (owner, 2026-10-27).** A product keeps its **main category** (`Product.categoryId`), which gives its path on the product page and its specification fields. It may also be listed under **further categories** in `ProductCategoryAssignment` (migration `20270127120000_product_extra_categories`, additive; the main one is never stored there).
- **The editor:** a tree of the product's half, with ticks, folding, a search that keeps the branches leading to a match, and «اصلی شود». The first tick is the main category; unticking the main one passes the role on.
- **The server** (`src/modules/catalog/server/product-categories.ts`) refuses a category of the other half or a missing one, allows at most twenty, and drops the main one from the list.
- **Other writers stay correct:** writers that only set `categoryId` (bulk «تغییر دسته», imports, sellers) keep the further categories as they are.
- **Shoppers:** listings and rails find a product under its main and further categories (`inCategories`). Category totals count **distinct** products (`membership` / `branchSets`), so a product ticked under a parent and its child counts once.
- **Evidence:**
  - `scripts/product-extra-categories.connected.cjs` (real PostgreSQL);
  - `.mobocom/claude-tools/pw-product-categories.cjs`.

**Store: the shop front (owner, 2026-10-27).** The shop landing and the category listing were redesigned on the existing owners; the single product page is approved and unchanged.
- The landing (`/products` without filters) has:
  - a hero: the welcome with a stage of up to three products, or the owner's slides when set;
  - beside the hero, today's deal (the soonest-ending offer in stock) and the newest pictured product;
  - six quick routes;
  - a category card grid with sub-categories;
  - a numbered best-seller list (three rows per column).
- The offer band with fewer than four offers lets its "see all" card fill the row.
- The listing has a banner with the category image, description and counts, sub-categories with counts, quick filters that toggle (available, discounted, online delivery, physical) and the result count in a sticky toolbar.
- **Product card (owner, 2026-10-27: "the cards are too plain").** One card everywhere in the shop (`ProductTile`), including the similar-products rail under a product page; the product page itself is unchanged. The picture carries a deal badge, a clock for offers ending within two days, delivery flags and a sold-out veil. Quick favourite (the member's list, `/api/engage/favorite`) and compare (this browser's list) sit beside the card link, each following its module. The body reads brand · category, the name, a star chip with the review count, sales, a short-stock bar, and the price beside a go button. Styles are in `src/app/store-cards.css`.
- Owners: `src/components/store/ShopHome.tsx` and `src/modules/catalog/server/pages/products/page.tsx`. The styles in `src/app/store-shop.css` are scoped to `.sx-landing` / `.sx-listing`. A theme page placed as the shop landing still replaces the default landing. Data comes from `shopHome` / `shopListing`; there is no new query or setting.

**Store: two stores and advanced filters (owner, 2026-10-27).** The shop is split into a digital-products store and a physical-goods store. Addresses keep their form:
- `/products` is the front: two doors (an empty half is not drawn), then what is worth seeing across both.
- `/products?kind=VIRTUAL` and `?kind=PHYSICAL`, with no other parameter (`isStoreFront`), are each a store front of its own. Each has:
  - its colour, and a hero with a search inside that store;
  - the deal and the newest product;
  - quick routes and its categories;
  - offers and best sellers;
  - category rails, brands, its service strip, and a link to the other store.
- Any filter turns the page into the listing. Links inside a store keep `kind` and are guarded in `store-v2.test.cjs`. Each store page has its own title and canonical.

Filters in the listing:
- Specifications come from the attribute groups of the listed products' categories: choice and colour fields, and text fields with 2–12 values. They travel as `s_<key>=value`, repeated for several values.
- Each facet counts with every other filter applied but its own.
- Also: members' rating (3+ / 4+), instant delivery (only where a product really hands over its code), ready price ranges (only when every listed price shares one currency), counts beside the switches and a search inside long lists.
- A tick applies at once; the button stays for typed prices and for browsers without script. Inside a store, the category tree is that store's.
- «تحویل آنی» is never said of a whole store, only of products that deliver by themselves (guard in `store.test.cjs`, now also over the shop front files).
- Since the variant slice, a specification filter also matches the values of a product's active variants (a headset in black and white matches both). A choice whose every value is a known colour name is drawn with dots from `store/domain/colors`, the table the buy box uses. The price facet gets a two-handle slider over the listed range, only when the prices share one currency.

**Cinema: film release calendar.** `CinemaTitle.releaseDate` (additive, migration `20261207120000`; unset = not on the calendar). `/cinema/calendar?kind=films` shows published films opening next and opened last, by day, in the layout the episode side has (`filmCalendar`, `groupDays`). The title pages are untouched (protected visual).

**Cinema: separate subtitle and audio files.** A `MediaLink` may be of kind `SUBTITLE` or `AUDIO` with a `language` from `TRACK_LANGUAGES` (migration `20261209120000`, additive). A track is not a release: it has no dub/original side, is shown in groups of its own under the releases in the order of the language list, is never offered to the player and never what "continue watching" opens (`isTrack`, `trackLinks`, `playbackKind`). It goes through the same protected link route as every file, so tokens, VIP and reports work; it does not count towards the daily download limit. The link editor offers the two kinds for films and episodes only. **In the site's own player:** the subtitle files of the same film or episode that the viewer may open and that are WebVTT or SubRip are offered as tracks (`watchSource` → `subtitles`). Each is served by the site at `/api/media/subtitle/<id>` (`openSubtitle`): the same checks as the link route (module, publication, takedown, price or VIP, page token), read by the server through the downloads module's public-address guard (`fetchRemoteBytes`, at most 2 MB), decoded as UTF-8 or else Windows-1256, and converted to WebVTT (`toWebVtt`); a file without a timed cue is refused. The file's own address never reaches the browser. The player switches on the viewer's language (Persian unless they chose otherwise) and remembers the choice on the device.

**Collections written by staff.** `UserCollection.staffAuthored` (migration `20261210120000`, additive). A staff collection is a draft while `PRIVATE` and published as `EDITORIAL`; it is written at `/admin/collections` and edited by **any** staff member holding a content permission (`CONTENT_EDIT_PERMISSIONS`: a collection holds items of every section, so it takes that list and not `cms.posts`). The public sees the site's byline (`EDITORIAL_BYLINE`), never the staff member's name. The two kinds are kept apart in the service (`src/modules/content/server/collections.ts`): the member paths refuse a staff collection even to the staff member who wrote it, and the staff paths (`*EditorialCollection`, `*EditorialItem`) refuse a member's list; selecting a member's public list (`featureCollection`) stays what it was. Taking a staff collection back to a draft keeps who followed, saved and liked it.

**Search facets, and one question about ratings.** A search can be narrowed by members' rating (3+ or 4+), by who may open the item (free, members) and by how new it is (week, month, year): `src/modules/search/domain/facets.ts`, `searchSite({ facets })`, `/search?rated=&access=&since=`, the same parameters on `/api/search`. A facet only removes results; the ranking and its bounded scan are untouched. The counts by kind follow the facets; a page cursor is bound to the facets it was made under; autocomplete is never narrowed. Access is decided by the item as it is now, not by the index, which can lag. Ratings are **read from their two owners** by one function, `ratingsOfItems` (`src/modules/reviews/server/ratings.ts`): shared item reviews from `ItemStat`, shop products from their approved `ProductReview` rows. It stores nothing and moves nothing; this is the interoperability between the two review stores, and neither is to be copied into the other.

**Recommendations: a provider contract.** The engine of a member's private suggestions (`src/modules/recommendations/server/personal.ts`) owns consent, which signals may be read, the bounds, what the member already has and the publication recheck. What goes with a seed is asked of the **provider for its kind of item** (`RecommendationProvider` in `domain/provider.ts`; the built-in ones in `server/providers.ts` answer from the catalogue). `useRecommendationProvider` puts another provider in charge of one kind and returns the way back; whatever a provider returns is cleaned (`cleanSuggestions`), and one that fails costs its own seed only and is logged. A new signal: the member's own **approved reviews of four stars or more** start suggestions (`rated`, weighed like a favourite), and nothing the member has rated is suggested back. A new kind of signal that is private history (watching, purchases) needs its own consent, as listening has.

**Every section is specialised like the cinema (owner, 2026-10-26).** Three principles:
- people and companies are picked from managed lists;
- fields follow the item's type;
- the types and lists are the owner's.

A list entry can carry a **family** (`Vocabulary.family`, declared per list by `families`) when the family decides something. A software platform is desktop, mobile or web, and that decides which of a title's fields apply. Developers and publishers of games and software are picked from the shared studios (`StudioPicker`, `/api/admin/studios/suggest` through the content-scope guard); the value stays a name that `resolveStudioId` links. Music follows the same principles: genres, release types and credit roles are lists, and a song credits artist profiles in a role (`MusicCredit`), which follow artist merges. The magazine follows them too: a post has a format from the owner's list, each format of a family (article, news, review, video, interview) that decides the post's facts (`Post.formatData`). A format change is proposed like the text while review is on. Name lists that imports also fill (film genres, countries, languages) match an entry by its English name too (`knownNames`), so imported values land on the owner's entries. The audit per section and the order of the next slices are in `handoffs/SECTION_SPECIALISATION.md`.

**A member has one address.** `/u/<username>` is the member's profile. What the forum knows about them is a part of that page (`?tab=forum`, pieces `&f=activity|topics|badges`), built by the forum (`src/modules/forum/server/pages/profile-section.tsx`) and handed to the profile page by the route, so neither module imports the other's pages. `/forum/u/<username>` redirects permanently there while social profiles are on (`forumAddressTarget` in `src/modules/identity/domain/profile-address.ts` maps the old tabs) and stands in by itself when they are off. A profile the viewer may not see does not show its forum part either. Editing the forum's own fields stays at `/forum/u/<username>/edit`. Every link names the one address (`profileAddress`: member lists, topics, mentions, quotes, activity, notices, the admin); since 2026-10-26 none arrives through the redirect. While social profiles are off, or a member has no social profile yet, `/u/<username>` hands over to the forum page (`forumStandInAddress`, temporary); the two hand-overs need opposite conditions, so they never loop.

**Playback preferences belong to the account.** `User.playbackPrefs` (migration `20261211120000`; rules in `src/modules/media/domain/playback-prefs.ts`): the audio side shown first (dub or original; nothing is hidden) and the subtitle the player turns on. `GET|PUT /api/media/playback-prefs`; set on the profile page of the dashboard, and the player saves a member's switch of subtitle by itself. A visitor's choice stays on the device.

**Every list a member keeps, read and written one way.** `src/modules/account/{domain,server}/lists.ts`: favourites, game shelves, playlists and collections are named by one key (`favorites`, `games:<SHELF>`, `playlist:<id>`, `collection:<id>`), listed by `memberLists`, looked up for an item by `listsHolding` and changed by `setInList`, which calls **the owner's own function** so the owner's rules apply. `GET|PUT /api/me/lists` (`version: 1`) is the address for apps. No list is copied or moved.

**One case around a waiting item.** `ModerationCase` (migration `20261212120000`; `src/modules/moderation/{domain,server}/cases.ts`): who has taken an item of the staff overview, a note for colleagues, and the record of a decision sent from the overview. The item and its decision stay with the owning module; a case decides nothing. Taking an item is one conditional write (two staff members clicking together: one gets it), a claim frees itself after `CLAIM_HOURS`, taking over is a deliberate second step, and a staff member acts only on sources they may moderate. Claims left a week are closed by the `moderation-cases` step.

**People of films and series.** `CinemaPerson`, `CinemaCredit` (migration `20261213120000`; `src/modules/cinema/{domain,server}/people.ts`): read out of each title's own director line and cast list on save (`syncCredits`), and for titles saved earlier by the `cinema-people` worker step, once. One person across spellings and roles (`normalizePersonName`). `/cinema/people` and `/cinema/people/<id>` show published titles only; the film page links the names it already shows. The title's fields remain the source of credits. Independent `/admin/cinema/people` management requires `cinema.manage`, not authorship or Magazine access. Curated display name/biography/picture extend that same person: matching key and credit IDs stay stable, role derives from credits, version claims and strict audit share the save transaction. Manual image locks include intentional blanks; automatic photo promotion respects the lock/version, and title presentation reads the canonical portrait. [Continuation and executed evidence](handoffs/CINEMA_PEOPLE_ADMIN.md).

**«چهره‌ها»: one section for actors, directors and singers (owner, 2026-10-27).** "A central section where every artist is: singer, director or actor, each with a page of their own and their works."
- **Name and address:** the owner asked for a suggestion and did not pick one, so «چهره‌ها» at `/celebrities` was taken. `/people` already belongs to the site's members (community).
- **Entries:** `Celebrity` (migration `20270128120000_celebrities`, additive) points at a `CinemaPerson` and/or a `MusicArtist`. The sections stay the owners of names, pictures, biographies and works; the hub only composes them.
- **Building the entries:** `syncCelebrities` runs from the public pages at most every five minutes per server, and from the manager. Each person and each artist (not merged away) gets an entry.
  - **The owner chose** that the exact same name (`normalizePersonName`) joins once.
  - A split keeps the two apart for good (`keepApart`); a join makes one entry of two spellings.
  - The side an entry's address came from keeps it.
- **Who appears:** the directory lists only people with a published film or series, or a published song or album (or a credit on one). Filters cover actor, director, producer, singer and the owner's music credit roles.
- **A person's page** shows films and series by role (each section's own `browseCinema` / `getArtist` rules), songs (playable), albums, credits on others' songs and the biography.
- **Links:** the sections' own person pages link to it.
- **Manager:** `/admin/celebrities`, reached from the cinema and music admin tabs.
  - Featured people and the list: either the cinema or the music permission.
  - Join and split touch both sections, so they need both permissions. Audited `celebrities.*`.
- **Evidence:**
  - `scripts/celebrities.connected.cjs` (real PostgreSQL);
  - `.mobocom/claude-tools/pw-celebrities.cjs`.
- **Not done:** a link in the site's main menu. The owner adds it in the menu manager, since global navigation is the owner's.

**One artist across the sections (owner, 2026-10-27).** "Merge the artists section completely: a singer may act, an actor may sing, a director may act in their own film."
- **One profile:** a person has one profile, edited once in «هنرمندان و چهره‌ها» (`/admin/celebrities`, `saveCelebrityProfile`). The name, English name, picture and biography are written into their music artist and cinema person through each section's own save (`saveMediaItem('music-artists')`, `savePerson`), so the section checks, revision history and concurrency hold. The cinema picture is locked so an import does not replace it.
- **No sections to choose (owner, 2026-10-27):** "An artist is one for music and for film and series, not one per section." The section ticks are gone; they could not be unticked. Every save makes whichever of the music artist and cinema person the person lacks, so they can be picked in the forms of both sections.
  - The editor shows what the person has published in each section; this follows from their works and is not chosen.
  - The English name is optional. Without it, the music address is `artist-<cinema person id>`, and a taken address gets "-2", "-3"…
  - A person split apart from a namesake does not take the namesake's cinema record.
  - Saving needs both the music and the film and series manager permissions.
  - The music home's artists shelf shows only artists with public music, so actors without songs stay off it.
- **Biography:** written in the site's content editor (the classic editor when it is on), never as typed HTML. It is cleaned on save (`cleanRichText`) into both sections.
- **One page:** a person shown in «چهره‌ها» has one page. `/cinema/people/<id>` and `/music/artist/<slug>` redirect permanently to `/celebrities/<slug>`, which carries both sections' follow buttons.
  - **Editable address (owner, 2026-10-27):** a new profile suggests `slug` from the English name and shows it for manual editing before save. Existing addresses stay until explicitly edited; changing a name alone never renames a page. The central URL is distinct from the existing music source address.
  - Previous central addresses stay reserved in `CelebritySlugAlias` (additive migration `20270130120000_celebrity_slug_aliases`) and redirect permanently to the current public profile/canonical. Known collisions and stale `expectedSlug` return 409, malformed addresses 422. The same public-work visibility and dual-section save permissions remain. [Executed evidence, compatibility and rollout](handoffs/ARTIST_SLUGS_PRODUCT_FEEDBACK.md).
- **Picking people:** the cinema cast and crew picker also offers singers not yet in cinema (managers only; authors keep their narrower list). Picking one names the credit, and the same name joins them into one person.
- **Works stay in their sections:** films, songs and their credits are still recorded where they belong.
- **Not done:** a person the sync found in one section only, and whose profile was never saved, gains the other side on their first save. Imported cast are not copied into the music artist list by themselves, since that list loads whole into the music forms.
- **Evidence:**
  - `scripts/celebrity-profile.connected.cjs` (real PostgreSQL). It covers both sides without an English name, the formatted biography in both, a one-section person gaining the other, the "-2" address, and split people staying apart. Breaking the split rule makes it fail.
  - `.mobocom/claude-tools/pw-central-artists.cjs` (16 checks): no ticks, bold from the editor reaching both sections, a stale-form edit fixed, an actor offered in the music forms' list, the music home shelf, redirects and axe.

**«چهره‌ها» is where the sections list their people (owner, 2026-10-27).** "Not every actor directs: make the central section professional, fully joined to cinema and music, with an attractive, advanced style."
- **One list:** `/cinema/people` and `/music/artists` redirect permanently to `/celebrities?section=cinema|music` (a search is carried over). The cinema and music menus point there; the people of a section are a tab of «چهره‌ها», not a list of their own.
- **Directory:** figures and search in the hero, a featured strip (the owner's featured people, else the most known; only on the plain first page), role chips with counts, section tabs, sorts and a first-letter bar (Persian letters plus «A–Z» for Latin names and digits).
- **Sorts:**
  - «سرشناس‌ترین» (the default): featured first, then a stored `Celebrity.score` (migration `20270129120000_celebrity_score`, additive). The score counts public films and series, songs, song credits and albums, an album counting three. It is refreshed with each sync.
  - «تازه‌ترین»: newest entries first.
  - «الفبا»: Persian names first, then Latin ones.
- **A person's page:**
  - a soft backdrop from their picture;
  - «شناخته‌شده برای»: up to six works;
  - a bar of in-page sections that sticks under the site header;
  - films and series grouped as directed, acted, then produced;
  - collaborators, meaning people credited on the same public films, songs or song credits, most shared first;
  - `Person` structured data.
- **Evidence:**
  - `scripts/celebrities.connected.cjs` covers scores, the three sorts, Persian before Latin, section tabs, letters, counts and collaborators. Breaking the name sort makes it fail.
  - `.mobocom/claude-tools/pw-celebrities.cjs` (27 checks) covers the featured strip, sorts, letters, the music tab, both redirects, collaborators, structured data, in-page links, and axe at 1440 light and dark and at 390.

**Sitemap and canonical addresses.** What the sitemap lists of a module is asked of that module with its own rule for what a visitor may see (`src/modules/seo/server/sitemap-entities.ts`): forums and topics through `visibleCategories(GUEST)` — never by reading the `access` column, which let forums of one group and their topics be advertised — and studios, film people, collections and category pages only when something public stands behind them. A listing page reached with filters gets its canonical address and indexability from `listingMeta` (`src/modules/seo/domain/seo.ts`): filters that make a list of their own stay in the address, a reordering is the same list, any other combination is not indexed.

**Versions of edited items.** Existing ContentRevision keeps changed content snapshots and a baseline for older items. Secrets, counters, ownership and financial history are excluded. Supported links/seasons/categories and product catalogue relationships now use versioned snapshots restored through their canonical owner; old scalar-only snapshots preserve current relations. `/admin/history?type=&id=` shows changes and restores as a new version with the same section permission. Unique-address conflicts refuse restoration. The last fifty versions are kept; Audit remains the record of actions. [Current scope and transaction limits](handoffs/CONTENT_MANAGEMENT.md).

**Where an item came from.** `src/modules/imports/server/provenance.ts` reads, from what every import already records, the imports that made or changed an item, its ids in the source systems, and the fields staff edited since the last import wrote them. It is shown on the history page so a re-import is not run blind over local edits. Nothing new is stored. (The importer already keeps external ids per source for repeatable imports, per-field create/update choices and a rollback that reports conflicts.)

**Admin workspace.** Saved views (`AdminSavedView`, migration `20261215120000`): a staff member names an admin address with its filters; kept with the account, at most thirty, the same name replaces. Keyboard shortcuts (`shortcutFor` in `src/modules/identity/domain/saved-views.ts`): `/` section search, `s` save this page, `v` my views, `g` then a letter for a section the staff member may open, `?` help. A shortcut never acts while a field is being typed in or with a modifier held. The component is mounted once, although the navigation is rendered twice.

**Public timeline of an item, apart from the audit log.** `src/modules/content/{domain,server}/timeline.ts`, `GET /api/items/timeline?item=type:id`, `/activity/<type>/<id>`: releases that are out, episodes that aired, published articles and forum topics a visitor may read about an item, newest first, composed on request. Who edited, restored or approved is privileged and stays in the audit log and the versions. **Retention:** the timeline stores nothing, so it has nothing to keep or prune; the audit log is kept in full (no pruning was added, by choice: it is the record of staff actions).

**Notifications: policy.** `src/modules/notifications/{domain,server}/policy.ts`, admin at `/admin/notifications` (`settings.manage`). Everything is **off until the owner sets it**:
- Keeping times: read notices by when they were read, any notice by its age; removed in bounded passes by the `notification-policy` scheduler step. An unread notice is never removed sooner than a read one.
- Daily summary: one email a day (kind `INBOX_DIGEST`, so the site's mail settings and each member's own switch apply) listing the unread notices of the last day **that have no email of their own**; queued once a day per member (`notification.digest` job, deduped), skipped when read in the meantime.
- Delivery receipts are **read from the channel jobs** (`notification:<id>:<channel>`), not stored again: sent, not sent (the member's switch, no address, channel not set up: not a fault), waiting, failed. Finished jobs live a week, so receipts do.
- A check that prunes or enumerates site-wide state narrows every read and delete to its own fixtures and keeps site-wide cursors in memory (`scripts/notification-policy.connected.cjs`).

## 6C. History: before and after launch (owner, 2026-10-07)

The system is being written from zero and has not launched. **Until launch, a rule that changes a stored number is applied to everything already stored**, not "from now on". **After launch, no update may ignore or reset the past**: it carries history forward by recounting from the stored events or by a data-safe backfill.
- Keep the events a number is made of (each reaction, each order line, each view record that is already kept), so a later rule can be recounted from them.
- A migration that adds a derived number sets its first value from the events in the same migration, and is safe to repeat.
- A setting that changes how history is weighed queues a recount of everybody; the recount sets values, never adds to them, works in batches with a cursor and can be interrupted.

**First use: forum reputation.** `ForumProfile.reputation` (migration `20261208120000_forum_reputation`, first value = the reactions each member had received from others) is the reactions received, each by the weight of its kind (`ForumSettings.reactionWeights`, 0–10, 1 unless set; forum admin → settings). A member's own reaction is worth nothing. Changing a weight queues `forum.reputation-recount` (`recountReputation`), which weighs every reaction ever given again. The leaderboard (period and all time), the profile's standing and the member directory read reputation; `likesReceived` stays the plain count that trust levels and badges ask for; "most liked posts" stays a count.

## 6D. The account and admin menus (owner, 2026-10-13)

The owner asked for both dashboards to be modern and for menus and sub-menus a person does not get lost in. What was decided:
- **One shell, one menu renderer.** The account dashboard and the admin share the frame (side column, top bar with the page's path, phone drawer) and `src/components/shell/ShellNav.tsx`; its styles are `src/app/workspace-shell.css`, project tokens only. The seller and reseller panels get the same frame from the same sheet and keep their short plain lists. No second component library: the suggested outside kits (shadcn/ui, the SDS demo) are references for judgement, not imports.
- **Grouping is presentation; addresses and permissions do not move.** A menu entry keeps its URL, its permission and its module switch wherever it is listed. A layout never decides what is allowed: the page and its API check again.
- **Admin menu, by area (owner, 2026-11-03: the panel had grown confusing and things sat in the wrong place).** What a thing is for decides where it sits, not who built it. Nine areas in `CONTROL_AREAS` (`src/components/admin/navigation/groups.ts`): home, content, community, sales, finance, people, marketing, website, system. A rail beside the menu shows one area at a time, and the area of the open page is on show by default; the finder (`/`) still reaches every area and names each result's area. A person sees only the areas they have something in. A feature module names its area in its manifest (`adminMenu.area`, checked by `assertValidExtensionManifest`); one that names none sits under system, so an outside module still installs. A core group lives in `src/app/admin/layout.tsx` with its area and order; an extension's link can join a core group (`adminNavigation[].group`). A group left with one link for a person is drawn as that link, and a long group may carry titled runs (`heading` on an item). The deepest matching entry alone is marked, and the top bar names area, group and page. Only the group holding the current page is open, or all of them in an area of two or fewer.
- **The admin home is for what needs doing, then the way in.** Attention and figures first, then a map of the person's areas, from the same permission-filtered list as the menu. Business figures need `dashboard.view`: a section manager gets their map, not an error.
- **Account menu, by what a member comes to do:** overview; orders and billing; my things; community; tools; messages and support; account settings; then the ways out (seller, reseller, admin, shop). Every group starts open; a group the member closes stays closed on that device (`localStorage`, the menu works without it).
- **Account pages share one design (owner, 2026-11-03: the dashboard looked plain and its fields untidy).** `src/app/account-design.css`, loaded by the dashboard layout and rooted in `.member-shell` (the seller panel shares `.user-shell` and keeps its own look): one page-header size for the fifteen header owners, one card surface, status pills with a dot, field focus, a quiet entrance and a mark on empty states, all off under reduced motion. Pages keep their own owners and markup; a new account page uses the `dt-` pieces (`dt-page`, `dt-head`, `dt-empty`, `dt-skeleton`) rather than a new header or empty style. A member's form request shows numbered steps, the expert's reply as a message and the sent answers as tiles; a secret answer stays masked and has no copy action.
- **The member home has one bright moment: the wallet card** (owner, 2026-11-03: a professional, advanced dashboard that draws the member in). The rest stays quiet: completeness as a ring round the picture with the missing items as chips, figures with an icon that count up once, section titles with their icon, the site's icons instead of emoji. A soft light follows a mouse over the account's cards (`src/app/dashboard/Spotlight.tsx`, its card list kept in step with `account-design.css`); touch and keyboard see the cards as they are, and every motion stops under reduced motion. An order in the list names what was bought beside a stack of its pictures.
- **The member shell has a room of its own** (owner, 2026-11-03: more professional and modern still). Behind the pages two soft lights in the brand's hue and a fine dot field that fades out; a glass top bar with the page's path in a capsule; a side menu with depth, a lit current page and captions with a rule; cards that are slightly see-through in the dark and take a lit edge when pointed at. All of it starts at `.member-shell`, so the admin and seller shells, which share `workspace-shell.css`, keep theirs.
- **A figure sits under its label on the right** (owner, 2026-11-03). The shared `.num` lets its digits choose the direction, so a number alone on its line reads from the left edge; in the member shell a right-to-left page aligns it right. A new figure in a card takes `justify-self: start` rather than a direction of its own.
- **A new admin page of a feature module is added to that module's manifest; a new core page joins the group it belongs to** — not a new top-level group, and not the end of the longest list. A group's icon is a name in `src/components/site/Icon.tsx`; an unknown name falls back silently, so add the drawing when a new name is needed.
- Covered by `e2e/tests/workspace-shell.spec.ts` (both themes and a phone: current page marked, groups by keyboard, finder, remembered choice, drawer and Escape, axe).

## 6E. A free platform for now, priced in toman (owner, 2026-10-13)

The owner decided: VIP is switched off for now and the whole platform is free; the site's and the dashboards' main currency is the Iranian one, not the dollar.
- **VIP and content selling start switched off** (`defaultEnabled: false` in the `membership` and `paywall` manifests). A site whose state was already stored keeps it until someone switches it off in Extensions & modules; nothing is deleted either way, and switching back on restores plans, memberships and prices.
- **VIP grows to the level of the WordPress membership plugins (owner, 2026-11-03)** without leaving the `membership` module or its switch. Spec and the map of what is done and what is next: `docs/specs/vip-memberships/SPEC.md`.
  - A *tier* is a level with a rank and perks (`MembershipTier`); a *plan* is one price of a tier. A plan with no tier is rank 1. Billing is days, lifetime or a fixed end. Rank decides upgrades: higher starts now with the unused paid share credited; the same or lower queues after the current end.
  - **Iranian gateways keep no card, so renewal is from the wallet alone** and only when the member turned it on. Cancelling stops renewal and keeps what was paid for.
  - A refund of a membership order revokes its periods (`revokeOrderMembership`). Before this the member kept VIP with their money back.
  - `MembershipRule` asks a tier or days of membership per item, at the file gate and the article gate; the item stays listed and locked. To hide an item from those outside a tier use the audience panel with `vip-tier:<id>`.
  - A tier gives store discount, free shipping and no ads through the same deal and ads paths as user groups, the best of the two winning. It never gives Admin access.
  - **Gifts, seats and approval** live in `membership/server/extras.ts`. A seat is an ordinary period with `source = TEAM` that follows the buyer's end. Refusing an application refunds to the wallet, also when the payment came through a gateway.
  - **Member import** is a destination of the import wizard (`vip-members`), not a second importer. It does not create accounts: an account is its owner's to open, and undoing a created one is not safe.
  - **`content.restricted`** is fail-closed: the default renderer writes the notice alone, and `documentFacts` does not read inside it. A new reader of a document must keep that.
  - **The description of a gated article comes from its teaser.** Building it from the body put locked text in the page head for every visitor.
- **VIP off ⇒ nothing is members-only.** The marks stay stored on items (`access = 'MEMBERS'`) and are simply not enforced: `Viewer.opens` (and `opensMembersOnly()` for server commands) is true for everybody, guests included, while the module is off. **`member` still means a real paid membership** and is the only thing prices, download quotas, ad hiding and the forum's VIP group look at — so switching VIP off never gives a member price away. A new access check asks `opens`; a new price or quota asks `member`.
- VIP marks on cards and pages are hidden from one place while it is off (`html[data-vip='off']`, set in the root layout from the module state; rule in `media-design.css`). A new mark uses one of the listed classes or joins that rule.
- With content selling off a priced item is free (`accessFor` answers "free" without reading prices) — that was already so.
- **Base currency: toman** — `BASE_CURRENCY = 'IRT'` in `src/shared/money/base.ts` (the rial would be `IRR`). It is what a new price, a new form and an empty screen start from, what an amount given without a currency is read as, and the currency the finance screens open in. **A stored row always keeps its own currency** and is never re-read through the base; nothing stored was converted (there is no rate to convert by).
- Left as they were, on purpose: the legacy dollar wallet (`User.walletBalance` and the `'USD'` branches of `wallet.ts`), each gateway's own fiat, foreign-cost (FX) pricing, the database column defaults, and the VPN demo seed (dollar plans; the VPN module is off by default).
- The shop, advertising, the seller marketplace and the extension repository are separate businesses with their own switches and were not turned off by this decision.

## 6F. The classic editor (owner, 2026-10-13)

The owner asked for the WordPress *classic* way of writing (not Gutenberg) in every section, and chose its engine:
- **TinyMCE, community edition, self-hosted, under GPL-2.0-or-later** (`tinymce` 8.x with `@tinymce/tinymce-react`, `licenseKey="gpl"`). The owner was told the consequence and accepted it: fine for a site the owner hosts; if MoboCom itself is ever sold or handed out closed-source, either a commercial Tiny licence is bought or this plugin is left out of that distribution. Nothing loads from Tiny's cloud; only plugins of the open-source edition are used (a test lists the tools).
- **A plugin of its own, `classic-editor`, on by default, manifest only.** It adds no table and no stored format: the value is the same HTML the older editor wrote, cleaned by the server on save (`cleanRichText`). Switching it off brings the lighter Tiptap editor back to the forms and changes no content; switching it on again changes none either.
- **One door:** `src/components/editor/ContentEditor.tsx`. A staff form never imports an editor directly; it imports this, which picks the classic editor or the lighter one from the plugin's state. TinyMCE is imported in exactly one file (`classic/ClassicEditor.tsx`), loaded on demand, never on a public page.
- **Visual and Text tabs**, as in WordPress: Text is the HTML itself with the quick tags (`src/modules/editor/domain/classic.ts`, tested); an address typed there that would run (`javascript:`, `data:`) is refused, the Visual tab drops elements that run, and the server cleans again whatever was typed.
- **Pictures are files, not text:** pasted, dropped and "add media" pictures go through the existing upload (`/api/admin/media`); no base64 inside an article.
- **A field stored as cleaned HTML is declared `richtext`** in the shared forms and written in the editor — not typed as raw tags in a textarea (software description, features, changelog, install guide; album description; artist biography).
- The block editor (`block-editor` plugin) is untouched and still owns block documents: a block document is never converted to HTML silently. Forum posts, ticket replies and comments keep their own small editor.
- Not yet built (next slices): the WordPress-style two-column writing screen for posts, a default editor per content type and per item with an explicit conversion step, the media-library dialog (today "add media" uploads), a Persian interface for TinyMCE's own menus, a smaller toolbar for forum posts.

## 6G. The page builder grows towards an Elementor-class tool (owner, 2026-10-13)

The owner wants a drag-and-drop builder of Elementor Pro's class for every page and section. What was decided:
- **The existing builder is extended, not replaced** (`src/app/admin/builder`, document in `src/modules/site/domain/builder.ts`, renderer `BuilderRenderer`, the theme builder for header, footer, post and product). One builder, one document format; no second page-builder and no imported builder library.
- **Advanced style on every block and section** (`adv`, `src/modules/site/domain/builder-style.ts`): spacing per side, typography, background and gradient, border and corners, shadow, opacity, hover, entrance motion, phone values, max width / min height / z-index, CSS classes. **Only bounded numbers, choices from a list and hex colours are stored**, and the CSS is written from those alone — a writer's text never becomes CSS. Free CSS stays where it already was (the custom-code block, staff only).
- The rules of one element are written beside it under its own class (`br-x-<id>`); phone values apply under 768px; hover only for a pointer that hovers; motion only where the reader has not asked for less and the browser can tie it to scrolling — elsewhere the element is simply there.
- `adv` is optional and absent when nothing is set, so documents saved before it are valid as they are and the format version did not change.
- **Effects of Elementor Pro's class (owner, 2026-11-03: "lots of styles and templates, effects and hovers, and my own HTML/CSS/JS for landing pages").** Still choices from a list on `adv`, never typed CSS: ten hovers (lift, zoom, glow, dim, 3D tilt, shine, ring, float, press, grey to colour), ten entrances (adding flip, from blur, rotate, pop), six loops (float, pulse, breathing glow, slow spin, wiggle, moving gradient), six surfaces (frosted glass, moving aurora, mesh of soft lights, fine grid, dots, a beam round the edge) and four heading effects (gradient, shimmer, glow, outline). Loops move through `translate`, `scale` and `rotate` and share one animation list with an entrance, so effects add up instead of replacing one another. Surfaces draw in the element's own stacking context (`::before`); shine uses `::after`. Shine and grey-to-colour exist only for a pointer that hovers; every motion stops under reduced motion. A toned section or panel also sets the colour tokens, so ghost buttons and cards inside read in either site theme.
- **Bundled landing templates** (`builder-landing-templates.ts`, helpers in `builder-template-kit.ts`): six whole pages (software and app, product launch with a countdown, course and webinar, creative agency, event, coming soon) and six effect sections, each made of ordinary blocks. Prices, dates and links are placeholders for the owner to set. Free HTML/CSS/JS stays the custom-code block and the page's code mode, and saving JavaScript still needs `settings.manage`.
- **The slider, tablet values, style clipboard and a richer structure panel (owner, 2026-11-03: "do the next stages, and put a slider in; I will build the site's templates with it").**
  - **Slider** (`slides` block, `BuilderSlides.tsx`, classes `br-slides`/`br-sld-*`, apart from the image carousel's `br-slide`): up to ten slides, each a background picture, eyebrow, title, text and two buttons; slide, fade, or fade with a slow zoom; height, shade and text position from lists; autoplay every 4–10 s with a progress mark and a pause button. It holds while pointed at, focused or in a background tab, does not play for those who ask for less motion, follows the page's direction for keys and swipes, and keeps the slides out of view inert. Pictures and links pass `safeSrc`/`safeHref` in the renderer.
  - **Tablet values** (`marginT`, `paddingT`, `fontSizeT`, `alignT` on `adv`) apply from 768 to 1024px; phone values below 768px still win.
  - **Copy and paste of style** in the advanced panel, kept in this browser only (`localStorage`) and always passed through `validateAdvancedStyle`.
  - **Structure panel:** each block shows a few words of what it says, a mark when it has advanced style, and sections fold.
  - **The private preview in its own tab is for looking:** the editing layer (select, drag, highlight) runs only inside the editor's frame, so tabs, sliders and buttons work there as on the site.
- **Twelve advanced blocks (owner, 2026-11-03: "very advanced, modern blocks with attractive styles and effects").** Flip box (turns on hover or focus; under reduced motion it changes face without turning), animated headline (typed, sliding or fading words; the first word is sent, a screen reader hears all of them once), before and after (a range control moves the cut, so keys and screen readers work), timeline, team, endless logo strip and scrolling text (paused on hover, still and without their copies under reduced motion), steps, comparison table (a highlighted column; yes and no are read aloud), video lightbox (the video loads only when asked for, in a dialog that Escape closes), notice and star rating. The browser parts are `BuilderBlocks.tsx`; every picture and link passes `safeSrc`/`safeHref`, every setting is a choice from a list.
- **The global kit (owner, 2026-11-03: "more professional, with stylish styles and effects").** One setting, `page.builder.kit.v1` (`builder-kit.ts`), shared by every page made with the builder: up to eight named brand colours (the first becomes the accent of every block), heading and text fonts from the installed ones (Vazirmatn, Inter with Vazirmatn, the system font), heading weight and sizes, corner radius, and the main buttons' style (solid, gradient, glowing, outline, glass). Every choice has a «like the site» value, which is the default, and an untouched kit writes no CSS, so existing pages keep their look until the owner sets something. The CSS is written on the page root (`.br-doc`, `.br-page` in code mode) from listed values and hex colours only. Advanced style colours (background, gradient, border and a new text colour) can point at a kit colour (`kit:cN`), which follows the kit when it changes and falls back to the accent when its slot is empty; the editor shows the kit's colours as swatches. Reading the kit takes `cms.pages`; changing it takes `settings.manage` and is audited. Public pages read it through the settings cache (a change shows within 30 seconds); the editor's preview reads it fresh.
- **Column layout and the accordion (2026-11-03).** A column lays its blocks in a row or a column (`layout`: direction, gap, horizontal and vertical alignment, wrapping, each a choice from a list) and takes its own advanced style like a block. A section chooses the space between its columns, whether its columns stay side by side on phones, and whether their order turns round there. The accordion block is native `<details>` sharing a `name` when one item at a time may be open; its text lines are paragraphs, never HTML.
- **Width and height are the owner's (owner, 2026-11-03: "blocks and default templates are not wide; I want to set the percentage of width or height of a column or block myself").** The standard section frame is as wide as the rest of the site (the theme's `--mb-chrome`, 97% of the page), not capped at 1180 px; this widens existing pages and every template, which is the request. The narrow frame (FAQs, countdowns) is 900 px. A section can set its own content width in percent (30–100, `style.widthPct`, absent means the frame chosen); columns (5–100) and blocks (0–100, 0 meaning the full column) take exact percentages through a slider and a number box. Any section, column or block can set a height in pixels or in percent of the screen (`adv.minHeightVh`, 10–100, written as `svh`).
- Planned next: dynamic values from the page being shown. Built already: the showcase and advanced blocks, the slider, tablet values, copy/paste of style, the structure panel, the global kit, column layout, the accordion, owner-set widths and heights, and display conditions for theme templates (`theme-templates.ts`); announcement pop-ups are their own module.

## 6H. Card-to-card payment: a name and a picture (owner, 2026-10-13)

The owner described the transfer as: the customer sees card, Sheba, account and bank, pays the invoice amount, writes the full name of the owner of the source card, uploads the receipt, and the management's approval turns the invoice to paid. What was decided:
- **The existing feature is kept** (`CARD_TRANSFER` gateway, `BankAccount`, `PaymentReceipt`, `/admin/bank-accounts`, `/admin/receipts`, settlement through `settleInvoiceManually`). No schema change.
- **A receipt needs the payer's name and the picture only.** Bank, tracking code, last four digits and time stay as optional help for the reviewer and are checked only when written (`normalizeReceipt`). A receipt without a tracking code settles under the reference `receipt-<id>`.
- The payment box (`CardTransferBox`) shows the amount in toman with its rial equivalent, the destination as a bank card with copy buttons, three steps (pay, send receipt, approval) and the state of the last receipt, including the reason of a refusal.

## 6I. The invoice is a document, and the wallet is not the VPN's (owner, 2026-10-13)

- **The invoice PDF is drawn, not printed from the screen.** `GET /api/invoices/<number>/pdf` (owner or staff, never a draft, never cached) builds an A4 document from the same data as the official invoice (`officialInvoice`) with `pdfkit`: embedded Vazirmatn, selectable text, pages added as rows grow, a QR code to the invoice. Two packages were added for it: `pdfkit` (MIT) and `bidi-js` (MIT). `pdfkit` stays outside the bundle (`serverExternalPackages`).
- Persian on a surface that draws left to right goes through `src/shared/text/visual-order.ts`: the bidirectional algorithm gives the runs, right-to-left runs are handed over word by word, numbers in Persian digits as their own piece. Any later PDF uses this, not a second helper.
- The invoice page offers "download PDF" and "print" (the same document opened in the browser); the screen-print button is gone from it. Only pictures kept by the site (`/api/media/covers/…`) are drawn as logo or stamp; a remote address is left out rather than fetched by the server.
- **Another person's invoice takes `invoices.manage`, on every surface** (2026-11-02): the invoice page, the official invoice, the PDF and the payment result answer the invoice's owner, or staff who pass `requirePerm(..., 'invoices.manage')` (server pages through `billing/server/invoice-access.ts`), so a section manager with the `ADMIN` role and no finance duty no longer reads customers' invoices; a role change, suspension, password reset, global restriction or the staff 2-step policy applies at once. The payment result shows stored state only (`billing/domain/payment-result.ts`): refunded before anything else, an order alone never makes an unpaid invoice paid, and a callback's `failed=1` never overrides a paid invoice.
- **An order and its invoice close together** (2026-11-02, `billing/server/order-closure.ts`): cancelling an unpaid order voids its invoice and frees its stock at once, a receipt waiting for staff stops the cancel, and a paid order cannot be cancelled from the orders list. Refunding a whole invoice closes its order: goods not yet sent go back on the shelf and the delivery is cancelled, goods already sent stay recorded as sent, and no stock is invented. An order with a return request is refunded through that request, never through the invoice, because the two together would pay twice. The delivery job leaves a refunded or cancelled order alone. Stored rows follow the rule through migration `20270203120000_close_settled_orders`. A staff wallet credit is in the site's currency unless another is named.
- **A member reads orders and invoices as documents (owner, 2026-11-10: "elegant, professional, advanced").**
  - `src/app/account-orders.css` is imported by the four dashboard order and invoice routes. Every rule starts at `.member-shell .app-main`, so `/miniapp/orders` (same views) keeps its look.
  - Status tabs carry the 2px accent rule. An order card shows its pictures, title, status, a five-step meter (`aria-hidden`; the pill says it in words) and its facts in one line. Service orders are one ledger card.
  - An order page has a facts strip, a stepper whose reached steps are in the accent, plain cards, a summary with the total under a full rule, and a dotted history.
  - The invoice list has a statement strip (due, paid, all) that filters, a segmented filter and a ledger: column names once for sight, `sr-only` labels in each cell, mono invoice numbers, end-aligned tabular amounts, an amber start rule on unpaid lines. Below 860px of ledger width each invoice becomes a short block.
  - The invoice document (`ui.css`, also public and print) is a plain sheet: seller and mono number under a hairline, one meta strip, a neutral table head and the total under a rule. The site-wide card glint is off on the invoice page.
  - Card-to-card payment (`globals.css`) has quiet steps and the sum as a large tabular figure. The bank card is graphite with its chip and mono numbers.
  - Links and data are unchanged. The list still opens `/invoice/<number>`; the dashboard invoice route keeps its service-ordering guard.
- **A page's share card keeps the site's card** (2026-11-02, `shareCard` in `site/server/seo.ts`): Next replaces the whole card when a page declares its own, so item and section pages put back their address, the site name, the language and the site picture. The root layout no longer states a canonical or `og:url`, because every page without its own claimed the home page; the home page states them itself. The sitemap lists final addresses only: an artist or film person with a public person page appears under `/celebrities`. `/admin` and `/dashboard` answer `x-robots-tag: noindex`. The starter support email is empty rather than a placeholder, and new installs get a `privacy` starter page.
- **Announcement popups are a module of their own** (owner, 2026-11-02, plugin `popups`, `src/modules/popups`, `/admin/popups`, permission `popups.manage`): the older announcement bar stays as it is. A popup names its audience (everyone, guests, members, chosen groups, managers of chosen sections, all managers), how often it repeats per person and an optional total. A group is one of the site's user groups (below); a section manager is `sectionsOf` over the current role, so a full administrator counts for every section. A member's count lives on the server (`SitePopupSeen`) and holds across devices; a guest's lives in their browser, per popup revision, so clearing it shows the popup again. Popups never open on checkout, payment, invoice, sign-in or setup pages, wait while the visitor types, and show at most one a minute. The panel only shows manager popups. The window and its styles load only when a popup is shown.
- **The site's group catalogue composes its owners and custom groups** (2026-11-02 continuation, `account/{domain,server}/site-groups.ts`): existing `role:<id>`, `vip`, `vip-plan:<id>`, `buyers`, `subscribers`, `sellers`, `resellers`, `crm:<tag>` and `forum:<id>` keys remain. Custom `group:<id>` comes from Account's additive UserGroup/UserGroupMember tables, with active/expiring membership, VIP/ad-hiding benefits and Store discounts/product prices. Identity Role and canonical guards remain the only staff authority; groups cannot make someone an administrator. `users.manage` controls memberships and section-access history, each item's own section permission controls its audience. Public shared discovery excludes restricted items/sections; album and track scopes both apply. The same keys drive popup audiences. Automatic forum trust/rank/club rules stay with Forum. This extends the earlier composed-only audience view, without implementing the future primary/secondary group hierarchy or automatic promotion system. [Current contracts, evidence, limits and rollback](handoffs/USER_GROUPS_POPUPS.md).
- **The wallet page names the plans only while the VPN section is on.** With it off the page leads to the shop (when that is on) and speaks of purchases, not plans.

## 6J. The site chrome, the wide pages and the shop's two halves (owner, 2026-10-13)

Decided with the owner over several rounds of looking at the result:
- **The header is two tiers.** The top bar (brand, search, theme, the member chip) stays at the top of every page. The site links are their own full-width row under it: they step aside on the way down the page and return on the way up. **Inside a section its own bar rides under the header instead**, and there the site links return only at the top of the page. On a phone only the top bar stays and the links live in the drawer.
- **No coloured outline around the chrome.** A quiet hairline and depth; the owner found the lit ring jarring.
- **The header is one quiet masthead (owner, 2026-11-10: "it must not look designed by AI").** The two tiers stay, as one card: the top row and the links row are joined by a hairline, and when the links step aside the card closes to one row. The brand's wordmark is the only colour. Surfaces, text and controls use the page's neutrals and the one accent. The current section gets a 2px accent rule on the card's lower edge (a short rule at the start edge in the phone drawer). Sign-up is the solid accent with `--on-primary` ink. The shared language and theme controls take the header's control shape. No glass, glow, hue gradient, gradient text, looping or entrance motion, sliding highlight or reading line. Heights, widths and the 74px section-bar line-up are unchanged. `scripts/navigation.test.cjs` guards these rules; `e2e/tests/header-menu-highlight.spec.ts` checks that each link carries its own highlight and focus ring. The section bars and the shared link panel (`NavigationBranch.module.css`) still use the older glass style and are the next candidates.
- **The member dashboard follows the same quiet system (owner, 2026-11-10).**
  - `src/app/account-design.css` is the member area's last layer, scoped to `.member-shell`; admin, seller and reseller keep their own look.
  - Surfaces, the top bar and the side menu are solid with hairlines. The member's own cover, portrait and completeness ring carry the colour.
  - The accent marks the main action, links and the current page, which gets a 2px rule as in the header.
  - Removed: ambient light, dot field, glass, the light under the pointer (`Spotlight.tsx`), counting figures, the gradient wallet slab, breathing and pinging marks, entrance motion and lifts.
  - The home title is the member's name, not a greeting. The shortcuts are one row of plain links. The wallet is a figure on a card with its action in accent ink.
  - Light-theme status, top-up and pill colours reach 4.5:1. A waiting transaction is shown by its pill and a muted amount, not by fading the row.
  - A menu entry is current only at its own address or below it, so `/dashboard/order` is not current on `/dashboard/orders`.
  - `scripts/navigation.test.cjs` guards these rules.
- **One admin page for every menu (owner, 2026-10-28).** "Menu and mega-menu management is confusing; I want full, advanced, tidy management." `/admin/menus` («مدیریت منوها», `settings.manage`) shows a clickable map of where each menu sits, with four tabs. Each edits its existing owner:
  - **Header:** the `site.config.v1` navigation tree with the section recipe.
  - **Section bars and mega menus:** `MegaMenuManager`, which keeps its own settings, save and history. `/admin/mega-menu` redirects to this tab.
  - **Footer:** support links, «دنیای موبوکام» and «فضای شخصی», each with where it appears.
  - **Automatic pages:** the `automaticPageLinks` switch, and each page's own `showInNav` saved through the Pages API (`cms.pages`).

  Site lists publish together through `PUT /api/admin/site` with the revision claim. Studio no longer edits menus; it links to the page. Pages added automatically to the header are listed by name, so taking «درباره ما» and «قوانین و شرایط» off the header is one switch each.
- **The home bar is the site's hub (owner, 2026-10-28: "complete the home navbar").**
  - The home section bar (`additionalSectionSources.home`) has four dropdowns, then the company pages, with «حساب من» and «پیگیری سفارش» as quick links:
    - «کشف کنید»: popular (game release calendar, new films, new music, latest software, magazine), and collections and tools;
    - «خرید»: shop, cart, order tracking, VIP, games, software, the file repository;
    - «جامعه»: community feed, forum, people, artists, businesses;
    - «راهنما و پشتیبانی»: tickets, FAQ, newsletter, terms, refund, privacy, advertising.
  - A link to a section that is off (or to the shop while it is off) is left out, an emptied dropdown is dropped, and the FAQ, terms, refund and privacy pages appear only when published.
  - They are ordinary bar items, so «مدیریت منوها» still hides, renames and orders them.
- **Pages built without code (owner, 2026-10-28).** "Design any page with drag and drop and ready blocks, with HTML/CSS/JS blocks when needed — e.g. a foreign payment page with a professional order form." The existing page builder (`/admin/builder/<id>`) already has drag and drop, phone, tablet and desktop previews, Elementor-class blocks (icon boxes, tabs, testimonials, counters, pricing, countdown, gallery, carousel, forms, live products and plans) and an HTML/CSS/JS block. This adds three parts.
  - **Whole-page templates** (`PAGE_TEMPLATES`): a foreign payment page (hero, benefits, steps, the form builder's own `foreign-payment` paid form with the day-rate amount, questions consistent with the terms, call), a service page and a campaign. Each part stays a normal block.
  - **Where to find them:** the builder's template panel («صفحه‌های کامل»), and Pages admin «＋ صفحهٔ جدید», which also lists the design templates. A new page opened with `?template=` starts from the template if it is empty.
  - **Forms:** a form a template names but the site lacks is made from the form builder's template **as a draft**. Rates, margins and payment are the owner's to check before publishing.
- **Terms text (owner, 2026-10-28).** "Write the terms for our services so we do not lose out and give no empty guarantees." The starter terms (`prisma/starter-content/terms.fa.html`, used by the seed and written to the local page) have 17 sections:
  - definitions, accounts, orders and prices, physical goods;
  - digital products, accounts and gift cards, currency and foreign-site payments, wallet, VIP;
  - content and copyright, user conduct, limitation of liability, force majeure, suspension, privacy, disputes and contact.

  Guarantees are only what a product page states. Third-party, bank and sanctions decisions are excluded. Liability is capped at the order amount unless the law says otherwise. Consumer rights follow Iranian law and the refund policy. It is a starter text, not legal advice; a lawyer should review it.
- **About sections and breadcrumb, second pass (owner, 2026-10-28).**
  - **About sections:** a bento of coloured cards, the first two wide. Each has the section's icon, its description (the menu link's own, else the homepage «یک حساب، همهٔ بخش‌ها» card for the same address), its live figure and its first sub-links.
  - **Breadcrumb:** a gradient ring, round separators, an underline on hover, and a current step with a live dot (still under reduced motion). On a phone it is one row that scrolls sideways.
- **A compact footer (owner, 2026-10-28).** "The footer is far too long; tidy it, professional, modern and stylish." «دنیای موبوکام» shows one tile per section: its icon, its name and how many parts it has. It never prints every submenu; those live in the header, the section bars and the mega menus. Section icons come from one map (`src/components/site/section-icons.ts`) shared with the about page. Spacing is tighter. On a phone the tiles are two columns and the help links span the full width. Height: about 1,600px → about 1,050px on desktop.
- **Page design templates (owner, 2026-10-28).** "About and contact look alike; each should have its own design. A contact form on the contact page, professional terms, and I want to design such pages myself from the admin." A page's `companyPanel` layout setting is its design template, «قالب طراحی صفحه»: none, about, contact or legal. It is chosen in Pages admin, which also has «＋ صفحه با قالب…» buttons that open a new page with the template set. Each template lays out the page's own text (classic or blocks) and its attached form (`formSlug`, built in «فرم‌ها و پاسخ‌ها»), so any page can use one. They share the channels and the map (`src/components/site/company/CompanyParts`).
  - **About:** the page title over the brand's story with real figures, «داستان ما» from the page text, sections, reasons, channels and a large map.
  - **Contact:** a welcoming head with quick phone, email and hours; the attached form in a card, without the form's own frame or heading; the channels stacked beside it; a map band; and the homepage's frequent questions.
  - **Legal:** a document head with last update, reading time, section count and print or PDF; Persian-numbered sections beside a contents list that follows the reader; the other legal documents; and where to ask. It prints as a clean document.

  The seed gives new installations a published `contact` form and starter templates (about, contact with its form, terms and refund as legal), and starter pages no longer join the header by themselves. The breadcrumb is one glass capsule, with the current step in the readable accent shade.
- **The about page (owner, 2026-10-28).** The company panel's about variant tells the story with figures taken from the site (`companyFigures`: published items of sections that are on, and active members; zeros and switched-off sections left out). It also shows the menu's sections and the homepage's «چرا موبوکام» items. The place is a large map: an OSM embed, dark-filtered in the dark theme, with a floating card. The card links to Google Maps, Neshan, Balad, Waze and OSM, built only from the saved pin, and offers copy address and copy coordinates.
- **One width for the chrome and every page** (owner, 2026-10-27: "pages 95–98% wide, the whole site and every section"; this replaces "reading columns keep their own width").
  - **The width:** `--mb-chrome` is set by the mobocom theme. It is `min(97%, 100% - 32px)` with no upper limit, and `calc(100% - 20px)` on a phone.
  - **Pages:** every page column (`.container`) takes it, and a column inside another fills it (`src/app/sections-wide.css`). CMS pages, older covered articles, plans checkout, subscriptions, tickets, the advertiser portal, the repository, the forum's related archive and the address book drop their own caps. The social feed's middle column fills what its side columns leave.
  - **Panels:** the dashboard and admin fill the space beside their side menu. Owner correction2026-11-03: the user dashboard's page column is96% of that available area, with no extra horizontal padding; notification/preferences roots fill it instead of stopping at960px. The standalone referral card also fills it. Keep this scoped to `.user-shell` in the existing `sections-wide.css`; Admin spacing, shared Mini App notification widths, dialog sizes and inner text measures keep their own contracts. [Verified slice](handoffs/PUBLIC_SECTIONS_QUALITY.md#account-dashboard-width--2026-11-03).
  - **Left at their own size:** the sign-in and sign-up card, small single-form pages (newsletter, becoming a seller), dialogs, advert slots, and a block's width chosen in the editor.
  - **Evidence:** `.mobocom/claude-tools/probe-widths.cjs` measures 45 pages at 1920, 1440 and 390 for their content span and sideways scroll.
- A wrapper around the header must never be a box (`display: contents`), or a sticky header cannot stay; the theme wrapper and the journal wrapper were both such boxes. Columns that pin themselves make room for the riding section bar (list in `theme.css`).
- The panels' main area (`.app-main`, `src/app/ui.css`) clips sideways overflow (`overflow-x: clip`) and is never a scroll box. A scroll box there made every sticky column and bar in the admin and dashboard stop sticking (the post form's side column, CRM notes, the store editor's side, the form builder's panels). Content wider than a phone wraps or scrolls in its own box (tables, tab rows); the 2026-10-25 sweep of 31 admin pages at 390 and 1440 px found nothing cut off after three phone fixes (magazine dashboard list, finance header, form-builder field tools).
- **Readable accent (2026-10-26).** The server derives readable companions of the owner's accent from the theme colours (`src/shared/color/contrast.ts` in `layout.tsx`): `--on-accent` is the ink for text on the accent, and `--accent-ink` is the nearest shade that reads as text on the page, kept as chosen when it already reads. Components that put accent-coloured text on the page use `--accent-ink`; small badges and chips on the accent use `--on-accent`. The main buttons follow it too: the owner chose readable ink on 2026-10-26, so `--on-primary` and `--sds-theme-accent-on` take the derived ink (dark on the current light accent, and white again if the owner picks a deep accent). Links drawn as main buttons keep it over the sections' plain-link `color: inherit`. Light pages follow the light accent for `--sds-theme-accent` too. Handoff: `handoffs/PUBLIC_SECTIONS_QUALITY.md`.
- **Music, film & series and games follow the light theme (owner, 2026-10-27).** "A professional, advanced, stylish and attractive light theme." This replaces "cinema and games are a dark stage whatever the theme". `src/app/media-light.css` loads after the sections' own styles. The dark theme is unchanged.
  - **Palettes:** in the light theme, the sections' own palettes (`--md-*` for cinema, `--gx-*` and the section bar for games) turn light. Their cards, lists, panels, reviews and link groups follow.
  - **Heroes:** they keep their picture under a light veil from the foot and from the side the words sit on, with the words in ink. The cinema banner and title head, the game page head and the music hero follow this. Music washes the hero in its own accent colours, because a dark cover blurred turns grey on white.
  - **Tiles with words on a picture:** genres, collections, the lead post, the game banner and posters on hover keep a dark veil and white words. Playlist cards are links, so their white words are pinned in both themes, since the sections' plain-link `color: inherit` had turned them dark on light.
  - **Ink and accent:** chips, badges, library buttons, review text and download buttons are given readable ink. Music's accent words use `--accent-ink`.
  - **Evidence:** `.mobocom/claude-tools/pw-media-light.cjs` runs 85 checks over 10 pages at 1440 light, 390 light and 1440 dark. It covers a light page, axe with contrast, pale gradient text (axe cannot read it), white words on tiles and no sideways scroll. Breaking the album title fix makes it fail.
- **Promotions ask once per page (2026-10-26).** The slots mounted together send one `GET /api/promo/serve?ps=a,b,c` (at most 16 placements) instead of one request each, so the 240/min allowance counts page views, not slots. `p=` still serves a single placement.
- **The member's picture rides in the session** (`session.user.image`, from `pictureOf`: profile picture, else the Telegram one), refreshed by the check that already runs on every request. The header, the dashboard and the admin shell draw it; the forum falls back to it when a member has no forum picture.
- **An article tells its whole path once**, under the navigation: home, the magazine, the categories above its category, its category, the title — the same list goes to search engines. The header no longer repeats a path on articles.
- **The shop is shown as two halves — goods that are shipped and products delivered online.** The halves are derived from `Product.kind` (`shopDivisions`): each half lists the categories and sub-categories that hold products of its kind, counted for that kind, and every link of a half carries `kind=` so the shopper stays in it. Made explicit in §6K.

## 6K. One shop, two halves, stored (owner, 2026-10-13)

The owner asked whether to split the shop into two stores. Decided: **one catalogue, one cart and one checkout stay; the half is stored on the category.**
- `ProductCategory.kind` is `''` (not decided), `PHYSICAL` or `VIRTUAL`. **A root category decides; everything under it carries the same value** (a child never keeps a half of its own), so a query can filter on the column alone.
- A half is refused while the subtree holds products of the other half, or an attribute group made for the other half (`ProductAttributeGroup.appliesTo`, which already existed). The message says what to move first.
- **A product is filed only under a category of its own half** (or an undecided one). The product editor offers only those categories.
- The migration sorts what is stored once: a root whose products all agree takes their half; a root that holds both, or none, stays undecided and is listed as such in the admin for the staff to settle. No product and no address changes.
- The admin shows the two halves as two trees with each category's attribute group. The storefront offers a decided category only under its half; an undecided one still follows its products.
- Rules live in `src/modules/catalog/domain/category-kind.ts` (pure) and `src/modules/catalog/server/category-kind.ts` (inside the save's transaction). Imports that create categories leave them undecided.

## 6L. What a buyer hands over for an order, and a price the buyer types (owner, 2026-10-13)

The owner asked for products that need information from the buyer (the login of an account to upgrade), for a "pay a foreign site with a Visa card" service priced from an amount the buyer types, and for staff to open a ticket to a customer. Decided:
- **A login given for an order is a secret of the customer, held for the work and no longer.** Answers are encrypted at rest on the cart line and the order line (the cipher and key of digital deliveries, `STORE_DELIVERY_KEY`). Every view masks a password, for the buyer too. Only staff with `orders.manage` read one, by a deliberate click that is audited before the value leaves the server (`store.order.inputs_reveal`). Lists, exports, notifications and logs never carry the values.
- **Erased when done.** Staff can erase a line's answers at any time; all answers go by themselves seven days after the order is delivered, cancelled or returned, or after an order that was never paid. `inputsErasedAt` keeps the fact, not the content.
- **Fields belong to the product and may be limited to some of its options;** the labels are stored with the answers, so editing the product later does not relabel an old order. Only the site's own products may ask (marketplace sellers cannot collect logins).
- **A typed foreign amount is priced by the server three times** — for the page, in the cart, and at checkout with the rate of that moment — with the product's own percentage and fixed profit (the FX fields that already existed). The amount, the currency and the rate used are stored on the order line. A missing or locked rate refuses the purchase. Limits per product (minimum, maximum, currencies). One per order line. No discount code on such an order.
- **Such products are bought through the cart only,** where the answers and the amount are checked; a purchase that skips it is refused.
- **Staff may open a ticket to a customer** (`tickets.handle`), which the customer sees among their own tickets and in their inbox. It is the channel for a one-time code: nothing of that kind is asked by any other means.
- Spec: `docs/specs/store-order-inputs/SPEC.md`.

## 6M. The form builder takes payments and hands work to staff (owner, 2026-10-14)

Editorial insertion follow-up (owner,2026-10-28): video from YouTube/Aparat/Namasha/Tamasha, Library/direct video and music/podcast/voice files are inserted wherever written content is authored, like the existing form insert control. Extend the same Editor registry/HTML adapters, Library, existing VideoPlayer and written-content mount. Use one dependency-free neutral codec with explicit pure-domain tests; no parallel media storage, Music queue or arbitrary iframe/script source. Per-media title/cover/caption/kind/ratio remain editor-controlled. [Implementation, evidence and boundaries](handoffs/EDITOR_MEDIA.md).

The owner asked for a Gravity-Forms-class form builder that the whole site can use, for paid orders (a typed foreign amount priced through the rate API, details, payment, a member of staff doing the work) and for any other form. Decided:
- **The existing forms module is extended; no second form system.** Its fields, conditions, steps, inbox and embedding stay as they were.
- **A form's bill is the server's.** Fixed costs, priced options and typed foreign amounts are priced on the page, on submit and again at checkout with the rate of that moment. The percentage and fixed profit of a foreign amount are never sent to visitors.
- **A form is paid through the site's one checkout** (`formSubmissionId`, order `meta.kind = 'form'`): an invoice, every gateway, the wallet. No discount code. A paid form needs a signed-in sender, who alone can pay it, once.
- **An answer is a piece of work**: open, in progress, done or rejected, with an assignee and a reply the sender sees under «درخواست‌های من». Staff do not start on an unpaid answer.
- **A password typed into a form** follows 6L: encrypted apart, masked everywhere, read by an audited click, erased a week after the work ends.
- **`forms.handle`** lets staff read and work on answers without the right to build pages; deleting answers and building forms stay with `cms.pages`.
- **A form chooses its own look** (theme, accent, corners, density, width, steps).
- **Designed form looks (owner, 2026-10-28).** "Forms should have several professional, attractive styles that I choose." Four themes join the five:
  - «دوستونه» (split): the title and description on a colour panel beside the fields, stacked on a phone;
  - «شفق» (aurora): a colour heading band with a soft glow;
  - «شب» (night): always dark with a glowing accent, keeping its own readable colours in either site theme;
  - «لوکس» (elegant): spacious, with a gold rule and underlined fields.

  They are chosen with the others in the form's look panel (`THEMES`, `forms-pro.css`). Evidence: `.mobocom/claude-tools/pw-form-themes.cjs` (29 checks: every theme at 1440 light/dark and 390, axe, no sideways scroll).
- Spec and the slices still to build: `docs/specs/form-builder/SPEC.md`.
- **Staff run every invoice from one desk, and an unpaid invoice may close by itself** (owner, 2026-10-14): view, make, edit, record payment, void, refund, delete; recurring invoices weekly, monthly, every 3, 6 or 12 months (Persian months); a price that followed an exchange rate holds 2 hours and closes earlier when its rate rises 3,000 toman — the customer is told on the invoice with a countdown and again when it closes («به دلیل نوسانات ارز فاکتور بسته شد؛ مجدد ثبت کنید»); default action close and delete, configurable; a transfer receipt waiting for staff keeps an invoice open. Spec: `docs/specs/invoice-desk/SPEC.md`.
- **An invoice says what it is for** (owner, 2026-10-14): a wallet top-up reads «افزایش موجودی کیف پول <site>» with «افزایش موجودی حساب کاربری پلتفرم <site> به مبلغ …»; a paid form uses its own invoice title and description, filled from the answer with `{field:id}` tags (the ready-made "pay a foreign site" form: the amount, the site and the account). Passwords stay masked; each answer keeps its own text direction. One pure owner, `src/modules/billing/domain/invoice-subject.ts`, feeds the invoice page, the customer's invoice list and the official invoice.

## 6N. The form builder: appointments, messages, hooks and who handles a form (owner, 2026-10-14)

The owner asked for the rest of the form builder in one go. Decided:
- **A turn is never overbooked, by the database.** A seat is a row with a unique key (form, field, turn, seat), taken in the same transaction as the answer. Times are Tehran's. A rejected or deleted answer gives its turn back.
- **A Persian date is an input, not a stored format**: the answer is the Gregorian day, so sorting, exports and conditions keep working.
- **Messages depend on the answers**: the first confirmation whose conditions hold; every notification whose conditions hold; merge tags fill in answers. An unknown tag stays as typed; a tag of a field with no answer is empty; a file or a password is never merged into a message.
- **A webhook leaves the site only to a public https address**, without following redirects, signed when a secret is set, and never carries a password. It is tried once.
- **Quiz points are the site's**: never sent to the browser; only the total comes back.
- **A draft lives in the visitor's browser** and never holds a password, a file, a signature or a turn.
- **A form anywhere in written content (owner, 2026-10-28: "like WordPress, a shortcode or the visual editor").**
  - **Shortcode:** `[form slug="contact"]` (also `[form contact]`, `[فرم contact]`) in a page's or article's text becomes a placeholder (`src/modules/forms/domain/embed.ts`). A paragraph holding only the shortcode is replaced whole; one written as code stays text; a bad address is left alone.
  - **Mounting:** `FormEmbeds` (in the root layout, inside the site providers) mounts the live form into each placeholder through a portal, also after navigation. It reads only a published form's public view (`GET /api/forms/<slug>`), and an unpublished form leaves its place empty.
  - **Inserting it:** the classic editor has «درج فرم» (the published forms, inserted as the shortcode); the block editor has a «فرم» block with a list of the forms; the forms admin copies a form's shortcode.
  - **Evidence:** `scripts/forms.test.cjs` and `.mobocom/claude-tools/pw-form-embeds.cjs` (13 checks). The block editor's block was not exercised in a browser, because that module is off on the local site.
- **A form may name the staff who handle it.** Then only they, and those who build forms, see its answers. Staff may correct plain answers — recorded — but not money, turns, passwords or files.
- Spec: `docs/specs/form-builder/SPEC.md`.

## 6O. Work somebody holds is theirs; a section has its own staff (owner, 2026-10-14)

The owner asked that each kind of work have its own staff who take it themselves, and that nobody step into the work of a colleague of the same standing. Decided:
- **Held work.** An answer to a form that a member of staff holds is **theirs alone: colleagues do not see it** (list, queue, export, field figures, files or opening it) since 2026-10-28, see below. A ticket so held can be read by colleagues who may open that department. Either is **changed only by its holder or by a manager** — `cms.pages` for forms, `tickets.departments.manage` for tickets (and accounts that hold every right). Changing means: the stage or status, a reply to the customer, reading or erasing a password, correcting answers, filing it away.
- **Taking and handing over.** Anybody who may open the work may take what nobody holds, and let go of their own. Only a manager hands work to somebody else. The first member of staff to answer an unheld ticket becomes its holder. A colleague may still leave an internal note on a ticket.
- **Taken form work is private; a form without staff is the managers' (owner, 2026-10-28).** "A form like foreign payment may have several staff; once one accepts it, the others must not see its details. A contact form may or may not have staff; without, it goes to management."
  - While nobody holds an answer, every named handler of its form sees it. Once one takes it, it leaves the others' lists, queue, CSV export and field figures; opening it, its passwords or its files answers 403.
  - Managers (`cms.pages` or every right) see everything.
  - A form without named handlers is open to managers only (`mayHandle`). Its new work is announced to the managers (`formRecipients`), never to every admin account, and automatic assignment and the automation's «handlers» go to the managers too.
  - Evidence: `scripts/forms.test.cjs` and `.mobocom/claude-tools/pw-forms-privacy.cjs` (14 checks against the API and PostgreSQL with two operator accounts).
- **A section's staff.** A form may name its handlers; a ticket department already names its roles. Work is announced to those people, not to everybody.
- **One place to work.** The forms admin has a queue across every form a member of staff may handle, with "my work" and "nobody's" filters. Somebody who only handles answers gets the queue, not the builder.
- **SMS has a ceiling.** Automatic alerts: not the same message twice in ten minutes, and at most twelve a day to one number. Codes, tests and messages an admin types are limited where they are requested.
- **A sign-in guess meets a limit on the account**, not only on the address it comes from.
- **Floods are an edge concern.** The application limits abuse of single features; absorbing a flood belongs to the CDN, WAF and reverse proxy.
- Handoff, the safety review and what is still untested: `docs/agent/handoffs/FORMS_AND_OPERATIONS.md`.

## 6P. Services are one list (owner, 2026-10-14)

The owner asked for a "Services" menu in the admin: things built with the form builder (paying a foreign site) and virtual products registered as a service, in one place. Decided:
- **A service is a mark, not a new kind of thing.** A form says so in its settings (`service`); a virtual product says so with `Product.isService`. Nothing is copied or stored twice.
- **`/admin/services` is a view**: each service with the work waiting on it and a link to where that work is done — the form's desk, or the store's orders. Staff see the half they may work on, and only the forms given to them.
- **A new core permission is added to `CORE_ADDED_LATER`** in `rbac.ts`, so a general manager stored before it existed keeps full access.

## 6Q. Roles can be renamed; forum levels and badges are the owner's to set (owner, 2026-10-14)

The owner asked for full control over roles, and over the forum's groups, badges and the standing shown under a member's name ("active member after X posts, helpful after Y likes, professor after more"). Decided:
- **A role's slug and titles can be changed.** Members hold a role by its id, so nothing else moves. System roles and the two slugs the code looks up (`admin`, `reseller`) keep their slug; their titles can still be changed. The limits on who may shape a role are unchanged.
- **Levels** are a list in the forum's settings: a name, an icon, a colour and three thresholds (posts, likes received, reputation). A member's level is the **last** level in the list whose every threshold they meet. It is worked out from their current figures whenever an author is shown — nothing is stored per member, so a changed rule holds for every member at once, old and new.
- **A badge may be given at a number of the owner's choosing** (`posts:100`, `likes:500`, also topics, reputation, accepted answers, days of membership), beside the fixed rules and badges given by hand. Saving such a badge gives it at once to everybody who already has that number.
- **The author card beside a post** shows the team rank, the level, the group, three figures (posts, likes, reputation) and up to four badges, framed in the level's colour.
- Groups keep the management they had (create, edit, members, automatic groups for trust levels).

## 6R. The platform runs routine work by itself (owner, 2026-10-14)

The owner asked for strong automation and chose all four kinds: a rule builder ("when … then …"), the flow of orders and requests, marketing, and automatic reports and alerts. Decided:
- **One engine, one permission.** `src/modules/automation` owns rules, their queue and their runs; `automation.manage` builds them. Other modules only announce what happened (`emitAutomation`) and keep their own rules: the engine hands out a request through the forms owner, changes a stage through it, gives codes as ordinary one-use promotions and sends SMS only within the existing consent and ceiling.
- **A rule answers only what happens after it is made**, once per event; a scan once per subject; a repeat only after a cooldown the admin sets.
- **Ready-made rules** cover the usual cases (welcome, abandoned cart, win-back, renewal, hand-out to the least busy member of a form's staff, alerts for requests and tickets left waiting, closing answered tickets, low stock, a daily report); each opens in the builder to be changed before it is saved.
- Webhooks from rules follow the form webhooks' rules (https, public addresses, signed).
- Not built: delays inside a rule ("wait two days, then…"), branches, A/B tests, retries for a failed action. Spec: `docs/specs/automation/SPEC.md`.

## 6S. Cinema metadata and organized photos (owner, 2026-10-17)

The owner requests server-side IMDb-ID enrichment without an API key, including synopsis/rating/credits rather than only basics, and automatic Library copies of available actor/director images. Extend Cinema's existing metadata facade and Media's queue; source/copy/fallback behavior belongs in Cinema Admin settings. New movie files go under `download/movie/<name>/`, pictures under its `images/`; actor/director photos under `download/cinema/images/actors/<name>/` and `download/cinema/images/director/<name>/`. Keep internal `film` keys, captured old destinations and published URLs compatible; no automatic move of old files. Use the existing canonical `download` root (the request's `donwload` is a typo). Unavailable/challenge pages are not valid title data. The requested keyless details flow uses the documented independent Cinemeta source by exact IMDb ID when needed, attributed visibly and switchable through `cinemetaFallback` (default on); off retains direct/basic-only behavior. Do not present this as repaired direct IMDb page access. Missing fields stay omitted, known same-name cast photos/roles remain, and unavailable people photos/full credits are disclosed. Never solve a challenge, invent credits/ratings or disguise partial metadata as complete extraction. Implementation and live-network limitations: [Content authoring handoff](handoffs/CONTENT_AUTHORING.md).

Photo follow-up: fill available actors/directors without paid keys through the same facade. Reuse stored/supplied photos; additional `peoplePhotos` setting controls bounded Wikidata exact-work relationships → exact person IMDb IDs → public suggestion photos, independently of local transfer selection. Never infer identity from a first name-search result. Preserve entered cast names/roles/pictures during ordinary autofill; skip ambiguous/truncated data and disclose omissions. Existing Media folders, queue and canonical CinemaPerson claims own copies/persistence. [Executed evidence and remaining limits](handoffs/CONTENT_AUTHORING.md#keyless-actordirector-photos--2026-10-17).

## 6T. Latest Games posts use Games records (owner correction, 2026-10-17)

«آخرین مطالب بازی» on the Games homepage lists actual published `GameTitle` records, not Journal articles or a fallback to Magazine. Reuse the existing latest/popular Games catalogue read models and canonical Games links. Retain the stored `news` rail key/order/visibility and legacy `newsKeywords` compatibility; Admin must describe the actual source. Per-game related Journal articles remain a distinct existing feature. [Implementation and evidence](handoffs/GAMES_EDITORIAL.md).

## 6U. Independent singer profiles (owner, 2026-10-18)

Manage singers at `/admin/music/artists` using the existing MusicArtist/Media owner. Preserve `music.manage` and own-artist `music.author`; authors read shared names but never delete shared artists or receive another author's draft work titles. Profile edits keep public slugs and historical album/track relations. Existing Library/editor/history/bulk remain authoritative. Unlike Cinema people, Music artists may already be public without published works. New form saves use timestamp claims and transactional audit; legacy partial writes remain compatible. [Continuation and exact evidence](handoffs/MUSIC_ARTIST_PROFILES.md).

## 6V. Cinema discovery and the meaning of a work count (owner, 2026-10-18)

Actor/director filtering uses canonical CinemaCredit person IDs and the selected role, combined with existing catalogue filters and public publication rules. Suggestions expose only public names/portraits. People-page counts describe works stored and published on MoboCom, not worldwide career completeness; two roles on one film count once in the directory. Bounded profile previews link to the complete paged catalogue. Keep the dark Cinema stage and isolate browse layout from homepage column rules. [Continuation and executed evidence](handoffs/CINEMA_DISCOVERY.md).

## 6W. Connected content management (owner request, 2026-10-18)

Imports preserve local edits when the new wizard's protection choice is enabled; old saved jobs retain their semantics and explicit overwrite remains available. Profile aliases/merges reconcile CinemaPerson/MusicArtist content while keeping old URLs and canonical UserId unchanged. Owner moderation decisions complete existing cases; typed Cinema/Music controls compose shared favorites, notifications, jobs and the player. Current implementation, migration, Admin coverage and verified limits live in [one continuation handoff](handoffs/CONTENT_MANAGEMENT.md); do not duplicate these owners or treat all static UI as universally configurable.

## 6X. Role default templates in the block editor (owner, 2026-10-20)

**Superseded for magazine articles2026-10-30:** the owner requested article-template removal. New post full templates/defaults are retired; historic rows remain readable. Page role defaults and ordinary reusable/synced patterns remain. See [current continuation](handoffs/EDITOR_GROUPS_EXPERTS.md). The paragraph below records the earlier decision.

"Role-specific templates" means a **default starting template per role**: for each staff role that writes in a section (pages or magazine articles), that section's manager chooses one of the section's full templates (`EditorPattern` kind `template`). A new item with no body yet opens from it in the browser; nothing is stored until the writer saves, and "start blank" removes it. Items with a body, items already saved in blocks, and the owner without a role open as they are. Templates are not hidden from other roles, and the structure is not locked by role (both were offered and not chosen). Stored in `EditorRoleTemplate` (one per role and section, cascade on role or template removal), set at `/admin/editor` with `cms.pages`/`cms.posts`, audited `editor.role-template.set`.

## 6Y. Search reads at most 5,000 matches (owner, 2026-10-20)

Of the three options in `docs/SEARCH-MEASUREMENT.md` (cap, trigram index, PostgreSQL full-text), the owner chose the cap. `searchSite` reads `SearchDocument` newest published first (`publishedAt desc, id desc`, keyset, new index `SearchDocument_publishedAt_id_idx`, migration `20270112120000_search_document_recency`) and stops once the list asked for (all, or one type) has `MAX_SCANNED_MATCHES` = 5,000 matches; it ranks those and answers `capped: true`. The search page then shows counts as "N+" and one line saying the newest results are shown and a narrower word helps. Autocomplete keeps its own 400-candidate sample. A word with fewer matches is read to the end, as before. Local synthetic measurement, 100,000 documents, median: every document matching 4,451 → 243 ms; a common Persian word (70%) 3,198 → 259 ms; 10% 519 → 382 ms; 1% 128 → 145 ms; one match 62 → 41 ms (development-mode app; run-to-run variation is tens of ms). Not a production figure; `--real` on a copy of production data is still owed.

## 6Z. Cinema credits picked from people; producers; a form by kind (owner, 2026-10-24)

The owner asked that the people of a film or series be chosen from a list, because the site searches by actor, director and producer, and that film-only and series-only fields not show for the other kind. Producers did not exist and were added as a third credit role: `CinemaTitle.producer` is a line like `director` (additive migration `20270113120000_cinema_producers`), read into `PRODUCER` credits by the same `creditsOf`/`syncCredits`, with a public `?producer=` browse filter, a "produced by" shelf on the person page, the directory and admin people role filter, and TMDb autofill from crew job `Producer`. The stored shapes stay (director/producer lines, cast JSON), so imports, history and public pages keep working; the admin form now picks names from canonical `CinemaPerson` profiles (`PeoplePicker`, `GET /api/admin/cinema/people/suggest`), or adds a new name that becomes a profile on save. An author reaches the suggestions through `requireContentScope` and sees people of published titles and of their own titles only. `MediaField` gained `section` (titled cards) and `when` (a field shown only when it applies; a hidden field keeps its value). Photos stay managed on the people page.

## 6Z-2. Cinema types are managed formats (owner, 2026-10-25)

The owner wants a free hand over the kinds of title (anime, documentary…) and full management of every section. Films and series are now two rows of a managed `CinemaFormat` list. Each format has a structure, one work (MOVIE) or seasons and episodes (SERIES), and a title's `kind` always equals its format's structure, so readers that know only films and series are unchanged. A format in use keeps its structure and cannot be deleted (service 409 and a database RESTRICT); an inactive format stays on its titles but is not offered. The slug is the stable filter address (`/cinema/browse?format=`). Spec and acceptance: [cinema formats](../specs/cinema-formats/SPEC.md). The owner's wider ask (a tidy, professional admin with full management for each section) continues section by section; each section's managed lists follow this pattern: a typed list owned by the module, the old fixed values kept as its seeded rows, and nothing removed.

## 6Z-3. Every section's fixed values are managed lists (owner, 2026-10-25)

Following 6Z-2, the values sections had fixed in code are the owner's managed lists in one shared system (`src/modules/vocabulary`: one `Vocabulary` table, service, API and admin component). Each section declares its lists in its own domain and counts its own uses; the registry names who manages and who only reads them. Games declare platforms, stores, play modes and localisations; software declares licence types. A code is what an item stores and never changes; the name, emoji, order and active flag are the owner's. Items keep only known codes (an inactive code stays where it was); an entry in use is deactivated, not deleted; public filters match whole codes. A new list or section is a declaration plus a seed migration, not a new table. Spec and acceptance: [managed lists](../specs/managed-lists/SPEC.md).

## 6Z-4. Magazine article page styles (owner, 2026-10-28)

**Current owner decision2026-10-30:** retire article-template creation, selection and format controls, keep historical rows as inactive archives and unrelated Page/Product builders; never execute old article templates or per-post Builder layouts. Extend the existing style studio with safe typography and editor BBCode decorations. Historical template/per-format instructions below are not a task to restore removed UI. [Current contracts and executed evidence](handoffs/EDITOR_GROUPS_EXPERTS.md).

"Several attractive, modern styles for the magazine's article page. I choose the style when I post, and I can make the style and template of an article page or a kind of article myself." What was decided:
- **A style dresses the plain article page; it never replaces it.** Progress bar, contents, the format's facts, author, related posts and comments stay in every style. A style is a set of attributes on the page's `<main>`, with its CSS in `src/app/journal-post-styles.css`. Without a style the page is exactly the usual one («کلاسیک موبوکام»).
- **Six designed styles** (`src/modules/journal/domain/post-styles.ts`), each with an id `ps-<base>`:
  - classic;
  - full-bleed cover;
  - split;
  - editorial;
  - cinematic (dark band, blurred cover, poster);
  - spotlight (colour card, very large title, the cover over its edge).
- **The owner's own styles** (`psc-…`, at most 24) start from one of the six. They set a colour, the title alignment, the text column width, a leading first paragraph, and corners.
  - A chosen colour is darkened for the light theme and lightened for the dark one only as far as 4.5:1 needs, so any colour stays readable.
  - There is no drop cap, because a cut-off first letter breaks Persian joining.
- **One choice, one place.** An article's choice is the builder's existing per-article layout setting (`post.template.<id>`); it holds a style or a builder layout.
  - The first match wins: `?style=` in the address (a look only, style ids only); the article's own choice; its format's choice; a published single-post builder template whose display rules match; the magazine's default style (`src/modules/site/server/post-presentation.ts`).
  - Styles still work while the page-builder module is off.
- **Where:**
  - «مجله → استایل صفحهٔ نوشته» (`/admin/journal/styles`): the gallery with drawings and previews on the newest article, the designer of own styles, the default, and a style or builder layout for each kind of article (the owner's POST_FORMAT list).
  - It is saved as `postStyle` in the magazine's settings (`journal.home.v1`, with history and the revision claim; `cms.posts` or `settings.manage`).
  - The article form has a «استایل صفحه» panel for the manager. It saves a saved article's choice at once through `/api/admin/builder/post-template` (`cms.posts`). A new article keeps its pick until it is first saved (`AdminCrud.onSaved`).
  - The builder's layout list shows the styles too.
- **Second set, 2026-10-28** ("several very professional page styles and several advanced, striking article templates").
  - **Four more styles:**
    - aurora: colour lights behind a darkened glass panel;
    - neon: a dark grid band, a glowing title and a neon-framed cover;
    - broadsheet: newspaper rules and a two-column lead, warm paper in the light theme;
    - luxe frame: a portrait cover with an offset outline and a gold rule.
  - **Seven designed article templates** (`post-pro-*` in `POST_TEMPLATES`): pro film review, step-by-step guide, full-colour feature, news desk, tech & product review, portrait & interview, aurora story.
    - Each is live blocks around the article: a side column of latest posts, top films or related products; help boxes; a newsletter call; related posts.
    - None holds one article's content, so any article or kind of article may take them.
  - **A builder document may name the style its header wears** (`layout.postStyle`). It is written only when set, so older documents are unchanged.
  - **Where to see and choose them:** the templates show as cards in «استایل صفحهٔ نوشته» and in the article form, and `?style=post-pro-…` previews one.
  - **Fixed on the way:**
    - The article's footer (author, related posts, comments) is no longer put on a light-toned builder section; it lost contrast in both themes, older templates included.
    - The author label, category chips and the comments eyebrow use the readable accent shade.
    - A product price in the products block uses the readable accent shade.
    - An embedded film or games shelf follows the light theme.
  - **Note:** a saved setting may take up to the settings cache's 30 seconds to show on a public page in the development server.
- **As wide as the site; templates managed here (owner, 2026-10-28).**
  - "Styles and templates must be 95–98% wide like the whole site; I want to make, edit, delete and add article templates and styles myself in the admin."
  - **No style narrows the reading column any more.** The width choice is gone from the designer, and a stored width reads as wide.
  - A builder template's boxed and narrow sections take `--mb-chrome` on an article page; full sections stay edge to edge. The built-in templates lost their narrow sections.
  - **«قالب‌های من»** on «استایل صفحهٔ نوشته» manages the theme builder's single-post templates through the existing `/api/admin/theme-templates`:
    - make one, from a ready template (the plainest is «کلاسیک», so title, cover, text and end are there), and open it in the page builder;
    - rename it, copy it or delete it;
    - switch «اعمال خودکار» on to publish it, so it dresses articles without a choice by its display rules.
  - Every ready template has «نسخهٔ من».
  - In the page builder an article template has «استایل نوشته» beside header and footer (`layout.postStyle`).
  - Own styles can also be copied and deleted from their card.
  - Evidence: `.mobocom/claude-tools/pw-post-templates-manage.cjs` (19 checks).
- **A fully custom article template** is still the theme builder's «قالب نوشته» (drag and drop with the article slots and HTML/CSS/JS blocks). It appears beside the styles in every list.
- **Evidence:**
  - `scripts/media-admin.test.cjs`: settings validation, readable colours, attributes, and the order of choices.
  - `scripts/journal-picker.test.cjs`: the preview article.
  - `.mobocom/claude-tools/pw-post-styles.cjs`, 44 real-browser checks.

## 6Z-5. Floating controls and a translated page's direction (owner, 2026-10-28)

"Remove the «کنارت هستیم» button at the bottom of the page entirely, move the Language button to the left, and when a visitor switches to a left-to-right language the whole site, its styles and its writing become left to right." What was decided:
- **The support shortcut plugin (`support-dock`) is deleted**, not merely switched off. It is gone from the code, the generated registries, the site defaults and every selector that made room for it. Support stays reachable from the footer and the user panel. The footer now reserves only the language button's landing space, and more where the live chat stacks above it.
- **The language button sits at the line's end** (`inset-inline-end`). That is the left of the Persian page, and the right of a page translated left to right. It therefore never meets the live chat or a panel's side menu, which sit at the line's start.
- **A translated page takes the translation's direction from the server.**
  - The root layout reads the widget's own `googtrans` cookie (only while `google-translate` is on) through `src/i18n/translation.ts`. A left-to-right target renders `<html dir="ltr" data-translated="ltr">`; Arabic, Urdu, Pashto and the like stay right to left.
  - `LocaleSetter` keeps that direction.
  - While the page is translated left to right, anything that names its own right-to-left direction reads left to right too (`studio.css`): article paragraphs, Persian-only widgets.
  - The site language (`lang` cookie, the dictionaries) is unchanged; this is only the machine-translated view.
- **The language choice is in the header, with flags (owner, 2026-10-28:** "like international sites").
  - A new extension slot `site.header-actions` sits inside the header's own row of buttons. The MoboCom theme and the default header carry it.
  - There, the translation plugin shows a pill with the flag and code of the language in use. Its panel lists Persian (the original) first, then each offered language with its flag, its own name and its Persian name. Arrow keys, Home and End move between languages; Escape closes and returns to the button.
  - A visitor whose browser speaks an offered language is asked once, in a bubble under the button.
  - **Flags** are drawn as small SVGs in `src/plugins/google-translate/flags.tsx`, because emoji flags do not show on Windows.
  - A language spoken across borders, or whose flag is disputed (Kurdish, Pashto, Tajik, or any unknown code), shows a code badge instead.
  - Where a header carries the choice, the floating button is hidden (`language-menu.css`). Themes without the slot (Orbital, Clean) and the account panel keep it.
- **Evidence:**
  - `scripts/site.test.cjs`: cookie parsing, directions, the layout and CSS rules, and that the plugin is gone.
  - `.mobocom/claude-tools/pw-header-language.cjs`, 42 real-browser checks.
  - `.mobocom/claude-tools/pw-translate-ltr.cjs`, 23 real-browser checks, with Google requests blocked.

## 6Z-6. An artist's profile fields (owner, 2026-10-28)

"Beside the biography, an artist's country, birth date and death date, and any field like these I can manage in the admin (add, edit, delete)." What was decided:
- **The fields are a managed list**: `celebrities / PROFILE_FIELD` in the vocabulary (`src/modules/celebrities/domain/fields.ts`), managed at «هنرمندان → فیلدهای پروفایل» (`/admin/celebrities/fields`) by `music.manage` or `cinema.manage`, like the artists' editor.
  - It starts with country, born and died (migration `20270131120100_celebrity_profile_fields`).
  - An entry's family is its kind: short text, long text, date, birth (shows the age), death (shows the age at death), country (a list of countries, or typed), number, link.
  - The owner adds, renames, orders and switches off fields.
  - A field some artist has a value in is not deleted (the vocabulary rule): it is switched off, which hides it from the form and the page and keeps its values.
- **Values live on the person** (`Celebrity.facts`, JSON code → value, migration `20270131120000_celebrity_facts`). They are saved with the central profile (`saveCelebrityProfile`) and cleaned by kind:
  - a date is a Gregorian day written by the Persian date picker, or a year alone; an impossible day is dropped;
  - links are http(s) only;
  - only fields of the list are kept.
- **On the artist's page**, short fields form a line under the name (dates in the Persian calendar with the Gregorian year, the age or the age at death); long ones are a section beside the biography. `birthDate`, `deathDate` and `nationality` go into the Person structured data.
- Evidence: `scripts/media-admin.test.cjs` and `.mobocom/claude-tools/pw-artist-fields.cjs` (16 checks).

## 7. Engineering rules learnt here

- **Stack (owner, 2026-10-19): Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2.** `src/middleware.ts` is now `src/proxy.ts` (export `proxy`; Next 16 always runs it on Node.js, so no `runtime` option). TypeScript 7 is the native compiler: `tsc` checks the whole project in seconds, but it has no JavaScript API. Test loaders that transpile TS therefore use the `typescript-api` alias (`npm:typescript@5.9.3`); do not `require('typescript')` in scripts. TS 7 dropped `baseUrl`; `paths` resolve from tsconfig. Next 16 dropped the `eslint` config key and builds with Turbopack by default.

- **A limit that guards a secret is `rateLimitStrict`** (`src/platform/http/rate-limit.ts`): sign-in, 2-step codes, password reset and change, registration, redeem codes, discount-code checks, the installer and API keys. With Redis the hit is counted there in one atomic step (`Kv.hit`) and that count decides, so the limit holds over all app instances; when Redis does not answer, each instance refuses on what it counted itself, so an outage is never a fresh allowance. `rateLimitHit` (synchronous, eventually shared) stays for throttles that protect capacity, not a secret. A unit test fails when one of the guarded keys goes back to `rateLimitHit`; `npm run test:redis` checks the behaviour against a real Redis (skipped without `REDIS_URL`).
- **A write to `/api` must show where it was made** (`src/platform/http/origin-policy.ts`, applied in `src/proxy.ts`). `Origin` decides when present and must be this site; without it `Sec-Fetch-Site` must be `same-origin`; without both a same-site `Referer` passes (old browsers); with none of the three the request passes only when it carries no cookies. So a session cookie alone never writes, and scripts, callbacks and API-key clients, which carry no cookies, keep working. A tool that writes with a session cookie (a test, `curl`) sends `Origin`. The exempt paths (`/api/auth/`, `/api/payment/`, `/api/telegram/`, `/api/internal/`, `/api/feeds/`, `/api/newsletter/unsubscribe`) prove themselves another way; a new exemption needs that proof.
- **Every pull request runs `.github/workflows/checks.yml`**: `npm run check` (with the PostgreSQL client, which is the one production runs and the code is typed against; the SQLite client does not typecheck), a first deploy on an empty PostgreSQL 17 (`deploy:migrate`, `deploy:seed`) followed by `test:pg` and `test:redis`, and the production build. Actions are pinned to commit hashes, the token is read-only, and `zizmor` lints the file. The browser suite uses the compiled HTTPS/PostgreSQL harness. Owner decision after PR #147: run and retain relevant browser evidence locally; `e2e.yml` is manual-only to avoid duplicate hosted browser usage. Do not dispatch it automatically or add another PR solely for this workflow adjustment. **A test must not depend on what surrounds it**: no `.env`, an empty database and a busy one must all pass (the rehearsal in a clean container found three tests that did not).
- **The server panel's file manager applies its policy to where a path really leads** (`guard` in `src/modules/server-panel/server/files.ts`). The check on the text of a path says what the admin asked for; the guard follows every symbolic link and asks the same policy about the real place: inside the panel's area, not virtual, writable for a write, not protected for a removal. Operations on an entry itself (rename, remove) keep a link a link and check the folder it sits in. **An archive is checked before anything is unpacked** (`src/modules/server-panel/domain/archive.ts`): its own list is read (tar headers including GNU long names and pax records; a zip's central directory) and refused for a path or link that leaves the folder, a file placed below a link of the same archive, a device, too many entries or too many bytes; then no entry may pass through a link that already stands in the destination. Zip64 and zips holding links are refused. A new file operation calls `guard`; a new archive format gets a lister before it gets an extractor.
- **Scripts run by nonce** (`src/platform/http/csp.ts`, applied in `src/proxy.ts`). Every response gets one random nonce; the middleware puts the policy on the request (Next reads the nonce there and writes it on its scripts) and on the response, and the layout reads `x-nonce` for its own inline script. `script-src` is `'nonce-…' 'strict-dynamic'`, `script-src-attr 'none'`, `object-src 'none'`; `'unsafe-inline'`, `'self'` and host names remain only as words older browsers understand. A page from the guest page cache is stored with the nonce it was rendered with and sent with the nonce of the response that carries it (`withNonce`). **An inline `<script>` written in a component takes `nonce` from `x-nonce`; inline event handlers do not run at all.** Scripts added by a running script (`next/script`, the builder's code block, the Telegram and Turnstile widgets) need nothing. The forwarder's countdown page, which shows pasted ad-network code, keeps the older policy. Styles keep `'unsafe-inline'`.
- **The database holds the states and amounts of money rows** (migration `20261216120000_money_state_rules`, check `money-state-rules`). `CHECK` constraints: a state column of `Order`, `OrderLine`, `Invoice`, `Payment`, `PaymentReceipt`, `WalletTx`, `FulfillmentJob`, `ReturnRequest` only holds a declared state; money that cannot be negative is not (a wallet balance included). Triggers refuse what would unsettle a settled row: a paid invoice is only refunded and its amounts stay; an invoice is paid only from open and refunded only from paid; a paid order does not become unpaid and a refunded one is closed; a confirmed or refunded payment, a done wallet row, a finished job, a rejected receipt and a paid refund do not change. A refusal is SQLSTATE 23514 with `state rule: …`. Code changes such a state with a claim (`updateMany` with the state it decided on, then the count), never with an unconditional `update`. **A new state or wallet row type needs a migration that widens the constraint**; a unit test compares the lists in code with the lists in the migration. Deletes are not guarded. SQLite (the browser suite) has none of this.
- **A module that grew past a few hundred lines is a folder of parts behind the same address.** `marketplace/server/marketplace.ts`, `store/server/marketing.ts`, `media/server/queries.ts`, `imports/server/adapters/store.ts` and `providers/server/panels.ts` are now lists of exports; the code sits in `<name>/<concern>.ts`, one concern per file. Other modules keep importing the address they always did, and never a part. Parts import each other by their `@/` address. A test that reads source reads all the parts; a test loader that stubs `@/` imports loads the parts for real.
- **A section can be put in maintenance by itself** (owner, 2026-10-07; `src/modules/site/{domain,server}/maintenance.ts`, applied in `src/proxy.ts`, screen `/admin/maintenance`, setting `site.maintenance.v1`). Sections: store, magazine, games, cinema, music, software, forum; each one's pages are its plugin's `publicPaths` (cinema also `/watch`). While on, every page of the section answers 503 with `Retry-After` and `noindex` and shows the notice (`/maintenance`, the owner's title and text as plain text, default words when empty), under the address the section is published at. **It is shown as it is only to the people who run it**: staff with full access, and staff whose role holds every permission of that section (the same rule as section managers), decided from the account as it is now. They get a strip saying visitors do not see it. The admin and the API stay open; only `settings.manage` changes the state. Saving claims the exact stored Setting value and re-reads/re-merges after a race, including concurrent first creation; it never writes from a cached or error-fallback state. A malformed stored value or failed database read aborts the write. Connected regression: `section-maintenance` (different sections and separate fields of one section). A section's items can still appear elsewhere (the home page, search, the sitemap) and their links lead to the notice. **The site is written in one language**: the pages and articles forms have no English title, excerpt or body field; the columns and their data are kept.
- A section in maintenance also leaves what lists its items for everybody: the home page (`getLandingData`), site search and suggestions (`searchSite`), the sitemap and the feeds read `closedPlugins` / `pathClosed` (`src/modules/site/domain/maintenance.ts`). The search index and `enabledItemTypes` are not narrowed, so the section's managers and the admin keep working and opening it again needs no rebuild. Anything new that lists items of several sections to visitors asks the same rule. Not covered: recommendations and blocks placed by hand in the page builder.
- **A section in maintenance is closed everywhere it reaches, not only at its pages** (owner, 2026-11-03: music could be played from an artist's page while music was closed). Its API prefixes answer 503 in the proxy; files and streams, which share `/api/media`, ask `sectionClosedFor` at the gate in `media/server/links.ts`; a page that shows another section's work asks it too. A new shared address that serves a section's content asks it as well.
- **The artists section (`celebrities`) is a maintenance section** with no plugin of its own; holders of `cinema.manage` or `music.manage` run it, as they do its admin.
- **Why it is closed is a choice:** repair, update or development (`MAINTENANCE_MODES`), per section and for the site. Each brings its own default words; the owner's words still win.
- **The whole site can be closed the same way** (owner, 2026-11-03): `site` inside `site.maintenance.v1`, the same setting, history, screen and place in `src/proxy.ts`. There is one switch family, not a second system. Full-access staff always pass, so the owner cannot be locked out; anyone else, section managers included, passes only if named or in a chosen site group (`opensDuringMaintenance`), and that holds for `/admin` too.
  - Kept open on purpose: sign-in and recovery, a bank's return and callback, webhooks and internal jobs, customers' subscription links (`/s`, `/api/sub`, `/api/happ`), and static files. Closing the site must not stop a payment half way or a service already paid for. A new route of that kind is added to `openDuringSiteMaintenance`.
  - Pages answer 503 with `Retry-After` and `noindex`; the API answers 503 JSON. Six designs, five effects and seven icons are closed lists; the words are plain text.
  - If the admin cannot be reached, `SITE_MAINTENANCE_BYPASS=1` in the server's environment opens the site without touching the setting.
- **Block content is a MoboCom document; an editing engine never owns the format** (`src/modules/editor/domain`, `docs/editor/ARCHITECTURE.md`). A document is a tree of blocks (`id`, `type` as `owner.name`, `version`, `props`, `children`); props are data checked against the fields the block type declares, never markup, a style or a script. Rich text is Tiptap JSON checked against a closed list of nodes and marks. A block whose type is not registered, or whose version is newer than known, is kept exactly as stored and never dropped or reinterpreted. `domain` imports nothing outside itself; `@wordpress/*` will be imported only under the editor's Gutenberg adapter and component folders. Steps 1 and 2 of Phase 1 are built: the format, and pages stored as documents (`Page.editorFormat`, `Page.contentDocument`, migration `20261217120000_page_documents`; `content` then holds HTML generated from the document). A save is checked on the server and names the version it was made from (409 when the page changed since); the old forms cannot write the body of an item written in blocks. **The block editor is the site's main editor (owner, 2026-10-07)**: a plugin (`src/plugins/block-editor`), on unless switched off on the extensions page, and with it off the pages and articles forms are the old editor again with every body kept; pages and magazine articles (`Post` has the same columns, migration `20261218120000_post_documents`); the pages and articles forms lead into it for the body; an old body is turned into blocks when opened and nothing is stored until the writer explicitly saves the first conversion. Autosave stays off while conversion is pending; omitted parts are disclosed and the first save is labelled as acceptance when parts were dropped. Successful conversion resumes ordinary autosave; the old body remains in revisions. The article page keeps its frame; only the source of the body's HTML differs. **The site is written in one language** (owner, 2026-10-07): translation is Google Translate's, and the pages and articles forms have no English body field; the `contentEn` columns and their data are kept. The editor screen (`/admin/editor`, step 3) is Gutenberg for blocks and Tiptap for rich text: every registered block type gets one generic editing component (settings from its fields, canvas from the public renderer), so a block type needs no editor code. `@wordpress/*` (GPL-2.0-or-later) is imported only under `src/components/editor/gutenberg`; the adapter `src/modules/editor/adapters/gutenberg/convert.ts` knows only the shape of the engine's blocks; a unit test fails on any other import. Nothing the engine serializes is stored.
- **Text direction follows the text, from one rule.** Editors start right to left; each paragraph, heading, list and quote reads right to left when it holds any Persian/Arabic/Hebrew letter and left to right only when its letters are all Latin, Greek or Cyrillic — a Persian sentence that opens with a product name stays Persian (owner, 2026-10-13; it used to follow the first letter). Stored HTML gets the same rule where it is shown, never where it is saved (`withTextDirections`). (`textDirection` in `src/modules/editor/domain/rich-text.ts`), shown while writing by `src/components/editor/TypedDirection.ts` in both editors and written as `dir` by the block renderer. Only Unicode letters decide automatic direction. Explicit paragraph direction overrides explicit containing block direction; otherwise first-letter inference applies, then the page default. `resolveTextDirection` is shared by rendering and editor decorations. Nothing is stored unless the writer chose a direction. A form field is left to right only when declared so or when its key ends in `En` (`AdminCrud`); do not guess from a substring. Guard: `scripts/editor.test.cjs`.
- A body stored as HTML by the older editor gets the same reading on the public page from CSS (`unicode-bidi: plaintext` on `.prose:not(.mcb-document)` in `src/app/editor-blocks.css`); nothing is rewritten in the stored HTML. Guard: `e2e/tests/loose-ends.spec.ts`.

- **Every migration belongs to exactly one release** (`prisma/release-manifest.json`, checked by `npm run release:migrations`, part of `npm run check`). A pull request that adds a migration adds its name to `unreleased` in the same commit. At a release the owner runs `node scripts/release-migrations.cjs seal <version>`, which closes the unreleased migrations as that version with the hash of each file; from then on editing one of them fails the check — a fix is a new migration. `node scripts/release-migrations.cjs list [version]` answers "what does this release run on the database". Release `1.6.0` in the manifest is the baseline: everything merged before the rule existed.

- **A pull request always targets `main`**, even when its branch sits on an unmerged one (it then shows the earlier commits and shrinks once they merge). Stacked bases made six merges land in each other instead of `main`. After the owner reports merges, confirm with `git merge-base --is-ancestor <branch> origin/main`.
- **The agent does not merge**; the owner does. Deploy and production actions are the owner's.
- **Evidence standard for a slice:** a connected PostgreSQL script (`scripts/<name>.connected.cjs`, registered in `scripts/run-pg-checks.cjs`, run by `npm run test:pg`) that asks the same functions the pages call, as several viewers; then deliberate breaks of each rule to prove the script catches them (back the file up and copy it back; never `git checkout --` an uncommitted file). Browser check with Playwright for anything visible, at 1440 light/dark and 390.
- **Data migrations preserve access and are safe to repeat.** Tests of data migrations run inside a transaction that is rolled back.
- Register unit tests by appending to a file already in `test:site`; put `CHECKS` entries on non-adjacent lines so parallel PRs do not conflict.
- **Local site:** `docker compose -f docker-compose.local.yml` (app on 3000, PostgreSQL on 127.0.0.1:5435). The container copies the working tree at start, so **restart it after every code change**.
- Persian dates are built with `formatToParts` and `timeZone: 'Asia/Tehran'`; relative-time components must not differ between server and browser.
- **A deliberate break that widens a write is run only against fixtures.** Breaking "file the songs of this album" into "file every song" rewrote the language of every real song on the local database before the check failed. Break the rule so that it reads more, or run it in a transaction that is rolled back.
- **Staff overview decisions stay with their owners.** A batch in `/admin/moderation` is one request per item to the owning module's admin API (`batchIds`, `batchOutcome`, at most `BATCH_LIMIT`); the overview never decides by itself.
- Floating helpers (translate prompt, support chat, manage bar) step aside while the forum's reply editor is docked (`body:has(.fx-dock)`); anything new that floats at the bottom joins that rule.
- **Generated extension files are committed byte for byte** (2026-11-04). `scripts/generate-extensions.mjs` writes LF only, and `npm run extensions:check` (first step of `npm run check`) fails when `src/extensions/generated/*`, `src/themes/generated/*` or `src/themes/generated.css` in Git differ from its output. A pull request that adds or removes a plugin or theme commits the regenerated files. A stale or CRLF copy made every installed site's build show them as changed and stopped its update.
- **Every updater treats what the build rewrites as the build's, not the owner's** (2026-11-04). `BUILD_WRITTEN` in `deploy/ubuntu/self-update.sh` and `update.sh` (one list, kept equal by a test): `next-env.d.ts`, `tsconfig.json`, the generated extension and theme files. Before the clean check, after each build and before a rollback, their difference is kept in `storage/update/build-files-*.patch` and the committed bytes are restored. Everything else still stops an update untouched. Every build on a server gets `BUILD_MEMORY_MB` (default 4096) of Node heap, and every fetch goes through `deploy/ubuntu/git-fetch.sh` (stall and total time limits, one HTTP/1.1 retry, optional `UPDATE_GIT_PROXY`). An update runs the installed version's scripts, so a fix to them helps from the update after it ships.
- **A link is written at its final address** (owner, 2026-11-04). Code builds track and album links with `contentPath(kind, slug, { artist })`; stored links (builder pages, menus, home sections) pass through `withCanonicalContentLinks` from the Site routing address before rendering. The 308 of an old address stays for outside links only.
- **Hosting, servers, cloud and domains are one section, «موبوکام کلاد»** (owner, 2026-11-04). One module (`hosting`), one permission, one member entry; `/cloud` is its overview and `/hosting`, `/servers`, `/domains` stay its pages under a shared section bar. Renaming never changes ids, permissions, data or addresses.

- **One local Xray proxy, several profiles, a profile per purpose** (owner, 2026-11-04). Purposes and their hosts are fixed in code (root builder and `social/domain/egress.ts`, kept equal); the panel only chooses which profile, or none, each purpose uses. A request goes through the proxy only when its host's purpose has a profile. Root helpers change only when the operator re-runs `xray-install.sh`. AI connection diagnostics use the same `egressRoute` decision and identify direct versus Xray without selecting a profile automatically or retrying a failed proxy request directly. The request deadline covers response-body consumption. Short Gemini2.5 Flash calls (at most1200 output tokens) disable thinking; longer editorial calls and other model protocols stay unchanged. Stored encrypted AI credentials bypass plaintext form limits; unreadable settings never become writable defaults. [Exact continuation and evidence](handoffs/AI_CONNECTION.md).

## 8. Open, by the owner's decision or still owed

- Production: run `npm run deploy:migrate` (through `20261215120000`), set `STORE_DELIVERY_KEY`, decide the return window for codes, the keeping times of notifications and whether the daily summary goes out (`/admin/store/returns`, `/admin/notifications`), configure SMTP/SMS for password recovery, arrange forums into sections, narrow roles that held `cms.posts`.
- Still open: facets by one review dimension and search ordered by rating/date; measured recommendation quality and consented watching-history signal; entity hubs for music labels/game franchises; more-than-yes/no decisions inside the overview and multi-round case history; member-shared lists beyond collections; rewriting Forum links to the canonical member address. Cinema person follows/notices and in-player ASS/separate audio are now implemented with [bounded local evidence and browser limits](handoffs/CONTENT_MANAGEMENT.md).
- Not yet verified in a browser: the full buyer's walk through the store, magazine and media sections; the other section editors beyond the magazine-only manager metadata/block-body flow verified on 2026-10-10; split/merge, polls and private messages in the forum. Evidence: [first autonomous safety batch](audits/2026-10-10-autonomous-release-safety.md).

## 9. Platform mandate adoption — 2026-10-10

The owner requested architecture/skill updates, with SDS and React Doctor for frontend design. [Canonical architecture](ARCHITECTURE.md), [focused contracts](contracts/platform-evolution.md), [adoption ADR](adr/2026-10-10-platform-mandate.md), [domain matrix](DOMAIN_CAPABILITY_MATRIX.md) and [incremental roadmap](IMPLEMENTATION_ROADMAP.md) adopt the source without treating it as already implemented. Software joins the focus; CRM remains first-class, VPN/reseller/marketplace stay set aside. All eight named public surfaces, including current Community, Store and Software, are preserve-and-enhance.

Section-specific keys/roles and full-access staff compatibility remain; Store's existing catalog/order distinctions are not collapsed. Fine-grained groups, capability decisions and scoped restrictions extend the same identity guards through compatible rollout. Existing forum group grants do not confer global staff standing. Audited recovery exceptions must be explicit. Install/activation distinction, operational lifecycle recovery, module themes and contextual server actions extend the existing registries/owners, not parallel systems. Canonical document, history, money, Origin/nonce/rate-limit and maintenance invariants remain unchanged. Owner still merges/deploys; PRs target main.


Owner2026-11-01: domain, SSL and email are entered during browser setup. No-argument trusted bootstrap exposes only temporary HTTPS8443/fingerprint/private-code setup; existing Server Panel services handle HTTP/DNS/PEM, then canonical identity closes setup. Explicit unfinished-install resume uses existing signed updater/mandatory backup and refuses installed/disabled/unknown state. Existing CLI/manual paths remain. [Exact continuation, evidence and deployment limits](handoffs/HOST_INSTALL_UPGRADE.md#browser-host-setup-follow-up--2026-11-01).


Owner2026-11-07: extend the existing visual page/theme builder to fullscreen live authoring, individual/global content/product layouts, independent header/footer, specialist sections, account/member-home and optional AI design assistance. This explicitly reopens NEW article-layout authoring after the earlier retirement: generation1 templates and explicit direct post saves only; archived records are not reactivated. Protected default designs, canonical block content, identity, module gates and financial/access actions stay with their owners. Presentation templates do not authorize server commands, arbitrary private queries, executable themes or silent AI publication. [Implementation and scope](handoffs/VISUAL_SITE_STUDIO.md).
## AI engineering authority — 2026-11-07

Owner selected automatic isolated development and PR creation, with production
promotion only after their approval. Existing per-request direct content-tool
policy is separate. New skills are stored inert instructions, never new server
authority. Preserve data and retain compatible code rollback; no automatic schema
downgrade, root terminal, hosted workflow dispatch or owner merge. Scope and
evidence: [AI engineering](handoffs/AI_ENGINEERING.md).


## Continuous platform AI and explicit GitHub updates — 2026-11-07

Owner wants the existing AI core integrated and support available for every turn, with optional human/ticket assistance. Default continuous mode does not stop after the old reply cap or a transient model failure; a human-assigned conversation remains exclusive. Public support remains about MoboCom and never uses personal Admin quota. Configuration readiness is not live provider verification. Preserve exact per-request/direct-tool and separate owner-approved production deployment authority. Explicit GitHub package download must use the existing updates network route and original publisher verification; downloading never installs. Keep manual upload and no unsolicited GitHub fetch on package installs. [Scope and actual evidence](handoffs/AI_CORE_SUPPORT_RELIABILITY.md).

## Organized item media, variant profit, publish choice, full AI fields — 2026-11-10

Owner: pictures uploaded for an item are filed by section/category/slug with readable names in the Library
(e.g. `/files/shop/product/Virtual/telegram-premium/cover.webp`), in every section; each foreign-currency
variant may carry its own profit percent and fixed profit; the publisher decides draft/inactive or live at
save; the assistant may fill every data field (SKU, variants, specifications…). Decisions: paths extend the
existing organization owner and are always computed server-side; existing URLs never move; `/files/` prefix
because `/shop/[slug]` is a page route; watermark covers organized images; variant profit is nullable
(inherit); a blocked AI row is draft-only; the publish decision, access and media stay human.
Handoff: `docs/agent/handoffs/STORE_MEDIA_PUBLISH_AI.md`.
Continuation (same day, every section): the file-upload button files a picture under its item when its editor gives
an item scope (game editor, music artist, cinema person, celebrity); celebrities get `celebrities/<slug>` (address,
else name); a cast/crew photo goes under `director` only when every credit is directing, otherwise `actors`;
uploads without picture access (403) keep the old file upload. The assistant also fills cinema people, music artists,
celebrities (names, biography, every switched-on profile field) and businesses (name, new slug, website, field,
description); `businesses.manage` may call it. Profile photos and publish state stay human.

## Renamed section names/addresses and auto-publishing desk — 2026-11-10

Owner renamed the journal to «مجله» at `/magazine`: breadcrumbs and outward links must follow. Decisions: the
section's display name is a section setting (`section.name`, default مجله); every link leaving the site (social
posts, IndexNow, JSON-LD) uses `toPublicPath`; a section's current address is never kept in its alias history.
The Telegram/Instagram auto-publishing admin is a status-and-preview desk on project tokens.
Handoff: `docs/agent/handoffs/MAGAZINE_ADDRESS_SOCIAL.md`.

## Everything is managed from Admin; section names everywhere — 2026-11-10

Owner rule: every section's name and address is fully managed from Admin, and anything we develop must be
manageable and editable from the Admin panel (no fixed labels, addresses or settings that only code can change).
Section display names live in one revisioned owner (`site/server/section-names.ts`) and are read everywhere through
`sectionDisplayName`/`<SectionName>`; new public pages use them instead of literal section words.
Handoff: `docs/agent/handoffs/SECTION_NAMES.md`.

## Whole-page article styles and new form themes — 2026-11-10

Owner asked for more professional, attractive article and form designs with effects. Five new article styles dress the
whole page (header and reading column), and four new form themes join the existing nine; all chosen from Admin like the
others, motion only with full-motion preference. Handoff: `docs/agent/handoffs/POST_FORM_STYLES.md`.

## File store front — 2026-11-10

Owner wants a «فروشگاه فایل» inside the store for selling files, designed and animated. It is a front of the existing
store (`/products?files=1`) over existing file products and secure delivery, named and worded from Admin › store
settings; cards show file kinds, count and size but never file addresses. Handoff: `docs/agent/handoffs/FILE_STORE.md`.

## Next.js 16.4.6 — 2026-11-10

Owner reported 16.4.6 as the current release. Patch update from 16.4.2 (only `next` and its `@next/*` platform
packages change in the lock; React 19.3.1 and TypeScript 7.0.2 stay). The stack line of 2026-10-19 otherwise holds.

## Required verified mobile and one email look — 2026-11-10

Owner wants SMS verification required for members who joined by email, Telegram or any other way. It is the
`phone` built-in of the existing profile-fields owner (Admin › فیلدهای ثبت‌نام), not a second gate: off on existing
sites until the owner enables it, never demanded while SMS cannot be delivered (`withPhoneDelivery`), verified only
through `/api/me/phone` (rate limits, uniqueness, expiry stay in the SMS module), enforced by the same `/welcome`
redirect after login, in the dashboard and now after Telegram sign-in. Every branded email (notification, security,
sign-in code, newsletter, gift card) is built by `src/modules/mail/domain/email-layout.ts`: tables plus inline
styles first; fonts, dark mode and motion only as enhancements; accent limited to a validated hex colour.

## Google sign-in — 2026-11-10

The owner wants members to sign in and sign up with Google. Identity owns it (`src/modules/identity/{domain,server}/google-login.ts`, `server/http/google.ts`); handoff: [GOOGLE_LOGIN](handoffs/GOOGLE_LOGIN.md).

- **Settings in Admin.** Admin › امنیت › «ورود و ثبت‌نام با گوگل» (`settings.manage`, key `security.google-login.v1`): on/off, OAuth client ID, client secret, and whether new accounts may be made.
  - The secret is encrypted with `PANEL_CREDENTIAL_KEY`, never sent back, and an empty field keeps it.
  - Saves go through the section-settings history (revision, audit, restore). The card shows the redirect address to register: `<siteUrl>/api/login/google/callback`.
- **Protocol.** OpenID Connect authorization code with PKCE (S256), a `state` held in Redis/kv and in a 10-minute httpOnly SameSite=Lax cookie on `/api/login/google`, and a `nonce`.
  - The ID token comes straight from Google's token endpoint over TLS, so its claims are checked (issuer, audience/azp, time, nonce, `sub`) and its signature is not (OIDC Core 3.1.3.7).
  - The token request uses the egress purpose `google` (`oauth2.googleapis.com`), so a server that cannot reach Google routes it through the Server Panel proxy. The root Xray builder lists the same host.
- **Session.** The callback leaves a single-use ticket in the address fragment of `/login/google`. NextAuth provider `google` turns it into the ordinary session only after the 2-step code, so bans, global restrictions and the required-mobile `/welcome` step apply as after any sign-in.
- **Accounts.** The Google account is its `sub` (`User.googleId`, unique, additive migration `20270301120000_google_login`).
  - A new account is created only for a Google-verified address that no account uses. An address already in use is never joined silently, which would hand a pre-registered address its owner's Google sign-in. The member signs in as always and connects Google from account settings, as with Telegram.
  - Connecting needs the signed-in member and a same-site start. One Google account per member, and one member per Google account.
  - Disconnecting needs another way in: a verified mobile, Telegram, a password the member set, or an account older than its Google connection.
