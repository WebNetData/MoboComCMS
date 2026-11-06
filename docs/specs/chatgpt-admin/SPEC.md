# Personal ChatGPT Admin and platform-only support

R3. Owner choice: personal ChatGPT plan only for their authenticated Admin tools;
customer support stays MoboCom-only and never uses an administrator's connection.
Extend existing AI/Livechat/Settings/Identity/Audit/Social egress owners. Preserve
canonical users, shared API configuration, routes, content and module-off behavior.

- Per-user encrypted Setting stores stable self-host ID, separate OAuth registrations,
  selected model and pending state/nonce/PKCE. Connection commands require
  `settings.manage`; generation still requires each existing section permission.
- Official OSS public-client OAuth uses a loopback listener. Admin downloads a
  short Node22 helper, runs it on their computer and opens its displayed official
  URL. Helper listens only on127.0.0.1, checks state and returns only the authorization
  code/client ID to the same site's Admin URL fragment. The logged-in Admin POSTs
  it; fragment is immediately removed. No tokens go through browser storage/URLs.
- Server validates PKCE/state/nonce/expiry, JWKS signature/issuer/audience/subject,
  granted plan scope and returning registration identity. One-use callback claim;
  stale/denied callback cannot replace a working connection. Account labels/models,
  connect/reconnect, select, enable/disable and logout are explicit personal controls.
- Fixed auth.openai.com/api.openai.com endpoints through existing AI egress.
  Tokens encrypted with existing credential cipher; exact-value Setting CAS/retry
  and shared refresh lease prevent rotation races. Logout clears local credentials
  and attempts official revocation; errors never disclose provider secrets.
- Only server-side Admin action context can select the actor's personal connection.
  Public livechat/Prompt Master and background calls keep existing shared provider.
  Personal failure returns a clear error and never falls back to paid API.
- Responses protocol: account-visible model catalog, instructions/input array,
  store:false/stream:true, bounded SSE through response.completed; quota, incomplete,
  malformed and interrupted streams fail. No unsupported parameters or tools.
- Customer support answers only platform navigation/content/services/account/order
  support from supplied facts. Off-topic requests get a fixed scope notice; uncertain
  personal actions hand off. No arbitrary model endpoint/tools or global identity.

No schema/dependency change. Default personal mode off. Disable/disconnect retains
registration mapping and host ID; no token in audit/logs. Existing sites keep their
provider and public behavior except the authorized support scope. Limits/eligibility
remain provider-controlled; fixtures do not prove live account access or usage.

Acceptance: focused AI/livechat/crypto tests, native PG two-admin isolation and
refresh/replay/CAS checks, malformed/authz/Origin/expiry tests and deliberate faults;
real loopback helper and recorded OAuth/JWKS/SSE, browser1440/390 light/dark/axe0,
TypeScript/architecture/security and affected React Doctor. No redundant full release
stack. Owner merges PR to main; no live login, real billable call or deployment.

Official contract: https://developers.openai.com/siwc/token-sharing-open-source
and its sign-in, profiles-and-sessions, self-hosted-vms, models-and-inference and
preview-limitations guides. Hosted public use of a personal grant is excluded.
