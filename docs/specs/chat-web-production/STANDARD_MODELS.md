# Explicit standard models and Chat readiness — 2026-11-08

Owner: existing AI production/credential/routing owners. Continue PR378/379; no
new container, shared job system, database migration or dependency. Develop on
running mobocom-app; preserve its data, credentials and existing services.

Production accepts text and image targets independently. Missing generation
configuration means the published personal Chat bridge path. Standard text uses
existing default/production API config or explicitly enabled credential pools;
Qwen/DeepSeek join the provider registry with official fixed endpoints. Model ID
is typed/bounded, credentials never enter batch config/client responses. Explicit
API/resource consent is required. Destination is pinned at creation and checked
before usage; changed/disabled config fails rather than switches provider/model.
API source never resolves personal ChatGPT/Codex. Images optionally use a dedicated
custom OpenAI-compatible image API (one bounded base64 bitmap, no returned URL
fetch) or Chat web. DeepSeek text models are not image generators. Online/free
quotas remain provider-dependent; local models are limited by host capacity.

One server API step claims the existing item/version/lease before model I/O,
outside the transaction, then reuses canonical text/image completion and save.
Origin/strict limit/section/actor/module guards stay. Concurrent/duplicate requests
cannot issue a second call for that lease. Stop/expiry/standing revocation rejects
late output; uncertain calls are not replayed. Browser cannot submit Chat output
as a standard API result. Existing reviewed draft receipts/prices stay immutable.

Bridge0.3 shares bounded DOM readiness for textarea/contenteditable composers and
send buttons. Only fresh owned Chat tabs are used, Work/Codex is refused. Clear
UI errors reveal the owned tab for manual login/mode selection instead of hiding
it after a long timeout. One send, no authentication automation/cookie extraction/
private inference endpoint. Capability preflight happens before persisted claim.
The real account UI is not available to the agent; fixture proof is distinguished
from live-account compatibility. Old bridge clients remain compatible; the new
bulk client requires bridge0.3 before browser usage.

Acceptance: targeted existing AI/production/credential regressions plus provider
selection/consent/binding, one-call concurrency, disabled/Origin/scope/late output,
API image byte/type/size/URL denies; connected PostgreSQL on a disposable database
using the same app container, no changes to its installed database. Actual browser
checks of provider/model controls, old batch resume, stop/errors and RTL1440/390
light/dark. Real unpacked extension against controlled DOM variants proves one
send, no send on ambiguous/composer/login/Work states and tab-bound callbacks.
Review affected React, architecture/types/source/security; no full release stack,
real account call, workflow dispatch, release or deployment.

Rollback: stop production, disconnect bridge or use prior source. Keep all content,
media, canonical documents, batches and route settings; do not restore/reset DB.

Authority: settings.manage permits choosing other configured pools or overriding
model IDs. Section staff can only use the assigned production API/model (or
site API default). This authority is rechecked before start and every API step.
Before rollback to code predating this protocol, cancel API batches and disable
AI; old code does not understand generation targets or new provider IDs. Any
restoration of prior AI settings from backup is an explicit operator action.
