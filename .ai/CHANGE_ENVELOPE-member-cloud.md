Goal: Complete Claude's five existing member-cloud commits, keeping the current dashboard design and canonical Hosting/Livechat owners.
Risk: R2 bounded UI; no schema, payment, provisioning, permissions or external calls change.
Scope: Cloud sidebar/submenus, existing catalogue/order presentation, truthful list loading/errors, entry guards and responsive chat close/focus. Existing purchased-service URLs stay valid.
Invariants: Same Identity and Hosting APIs, module-off behavior, customer ownership and existing checkout; preserve Claude's work, existing user data, owner settings, public design and untracked files.
Proof: Actual authenticated PostgreSQL-backed dashboard, guest denial, native keyboard selections, list failure/retry, desktop/mobile light/dark chat close/focus and scoped axe, affected TypeScript/React diagnostics and source/architecture gates. No repeated full suites or hosted workflow.
