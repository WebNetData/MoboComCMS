# Telegram authority and retained restriction history — 2026-10-11

## Bounded implementation

Existing Identity userForTelegram/attach/claim and the verified notifications webhook compose canonical standing/GLOBAL facts. Ordered User locks and transaction readers precede account metadata or merge effects; one bounded P2002 retry resolves simultaneous initial Telegram account creation. Denied linked users cannot fall through to anonymous account creation/private commands. Public help/language prompt/catalog remain available without account grants. Existing NextAuth already denied GLOBAL; this is not a newly fixed website-login bypass.

Healthy placeholder merge moves every AccessRestriction row with its scopes, dates, revoked state and immutable audit references, and reassigns the nullable scalar RepoLicense.userId before deleting the old User. Money states/amounts, staff roles and forum sanctions are not rewritten. Claim keeps its existing canonical UserId. Twelve unchanged presentation helpers moved behind the existing webhook address into private messages.ts. No schema, package, permission or protected visual changes.

## Executed local evidence

All logs below are retained under root .mobocom/restrictions-<id>.log. Owned fixture only, actual PostgreSQL/Redis, non-root Node22, no .env; no real Telegram provider sends.

- Final 53 connected unit tests: 1791707452062-19968. Normal connected Telegram owner: 1791707452063-45196.
- Final full check: 638 tests, native exit0, 1791707561421-18816. Final production build: native exit0, 1791707561422-43072 (existing CSS warnings retained).
- Final six PG owners: Telegram, Global Admin, global authentication, scoped restrictions, repository-license owner, import-execution authority; native exit0, 1791707871462-29908. Explicit one-connection Telegram check passed 1791707077773-16824; two controlled external-connection waits run in the normal suite, not the single-connection variant.
- Final compiled HTTPS browser: 23 pass, zero fail/skip/retry, 37.2s, 1791707861274-18936. TypeScript: native exit0, 1791707861180-42220. Actual Global Admin issue/revoke → local fake Bot API → denial/restoration/healthy merge; secret/private-chat verification, private wallet output, preserved history and money assertions. Existing protected Admin light/dark/mobile/a11y regressions included.
- Ten deliberate fixture faults failed on relevant assertions and source was restored: metadata GLOBAL (1791706711555-24832), target GLOBAL (1791706712343-38208), source GLOBAL (1791706713249-27236), claim GLOBAL (1791706714061-19104), restriction transfer (1791706714859-12172), license transfer (1791706716010-20732), ordered lock (1791706717185-26396), external transaction reader/pool timeout (1791706718213-31664), webhook GLOBAL/private delegates (1791706720997-16644), actual initial unique-constraint retry (1791706798509-14440).
- Injected restriction-storage outage logs are expected fail-closed test evidence, not an observed production outage. Earlier checks remain separate from these final gates. Seven-file line-ending normalization afterward verified identical TypeScript emitted JavaScript; diff whitespace check passed.

## Real remaining gap and limits

Actual owned PostgreSQL audit 1791708167945-38656 reproduced an existing healthy merge deleting source UserProfile and its public username: source profile existed, attach merged successfully, both old username and target profile were absent afterward. Production data was not touched. Broader modern account-data/relationship/URL merge remains WEAK_BACKEND; this bounded history/authority slice does not certify the whole merge. Audit actual relations and collision policy next; do not invent losses in editorial models with no User relation.

Transport/config and private bot delegate boundaries are doubled in native tests; browser uses real compiled transport against a local fake API. Native tests exercise actual claim; compiled registration UI claim flow was not tested. Authorization does not cancel an already-authorized in-flight provider/financial obligation. Current graph is static discovery, not runtime proof; no measured token savings claimed. Root application/:3000, production schema/data/providers and GitHub Actions remain untouched. All-instance deployment, recovery/resource/group policies and broader release readiness stay PARTIAL.
