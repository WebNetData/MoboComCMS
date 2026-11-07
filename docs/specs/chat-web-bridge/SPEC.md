# Personal Chat web writing bridge

Owner: AI/editor, extending the existing article writing assistant; canonical
Identity, permissions, module state, sanitizer and CMS save remain authoritative.
Owner chose an unofficial personal browser bridge after disclosure that UI changes
can break it and account limits still apply. No free/unlimited billing promise.

Slice: restore AdminCrud richtext rendering with block-editor off, then add an
explicit Chat web transport for article source/polish/excerpt suggestions. A local
unpacked MV3 extension, approved for one HTTPS MoboCom origin, opens its own fresh
background chat tab. It submits once through the visible Chat composer and returns
only that tab's new assistant answer with a per-request completion marker.

No cookie/token extraction, remote browser debug port, private web API, captcha
bypass, paid API fallback, support-user/account sharing, autonomous tools or
publication. Login/model choice remain in the owner's ChatGPT browser account.
The extension never reads existing conversation tabs. User reviews before CMS save.

Private POST /api/admin/ai/chat-web v1: prepare returns the existing writing prompt;
complete validates the same input and sanitizes returned text through the same
parser as API writing. cms.posts + module + explicit Origin + strict actor limit,
bounded streamed JSON and private/no-store responses. No new durable state/schema.
Extension messages are versioned, request-ID/tab/origin bound and length bounded;
one active request, timeout/cancel, no replay, stale replies ignored. Local optional
host permission can be revoked from the popup; no wildcard grant at install.

Acceptance: reproduce original HTML-input bug; real visual editor save/reload,
blocks-off lock and lightweight fallback; exact prompt/parser equivalence, unsafe
HTML and malformed/oversize requests, actor/module/Origin denies; actual unpacked
extension against a controlled Chat DOM fixture, timeout/cancel/foreign origin and
no API fallback; actual Admin UI result/undo/stale form/RTL themes. Real ChatGPT
account access is operator verification, not inferred from fixtures. Reuse already
green unrelated checks. Owner merges/deploys; published1.7.9 stays immutable.
