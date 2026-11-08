# Personal Chat agent handoff reliability

R3 owner: existing AI Production client/server leases and desktop Chat bridge.
Goal: one text request then one distinct request per selected picture in the same
owned conversation; complete or report the exact blocked stage without blind replay.

Source evidence0.5: navigation can commit before the user DOM node. Actual unpacked
extension reproduces immediate owned-path refusal with delayed user hydration. Old
fixtures appended the user synchronously and missed it. Downloaded0.5 source matches
the shipped ZIP; live browser host remains unavailable and the user's real account
is not certified. The user confirmed0.5 still fails.

Operator0.6.2/schema3 evidence identifies the real visible UI: user messages carry
`data-user-message-bubble` and text parts carry `data-search-result-target`, with
zero legacy author-role/article nodes. Shadow hosts in that report are add-ons,
not proof of conversation content in Shadow DOM. Bridge0.6.3 recognizes those
observed nodes. Response fallback is anchored after the exact request's user bubble,
excludes navigation/editor/other user messages, and never confirms a sidebar title.
Read-only diagnostics expose counts and a masked route, not message text or IDs.

0.6.4 operator failure: exact send-confirmation timeout, even though the later
read-only report sees the matching user/complete JSON. Reproduced by delaying both
root-to-thread assignment and user hydration past20 seconds; the old recovery
branch required an already-assigned thread and never ran. Bridge0.6.5 observes
confirmation within the existing operation deadline, with no deadline extension or
second send. The confirmed flag follows the worker acknowledgement. Sanitized
route-failure metadata distinguishes receipt/message stages without paths/IDs.

Reviewed save now preserves the generated clean slug. Only actual existing slug
collisions add readable -2/-3 suffixes; bounded unique-constraint retries preserve
the canonical content/history/item receipt transaction. Existing URLs are retained.

0.6.6 image continuation: the owner explicitly chooses automatic first variant when
no preference was selected. A current owned-response click or semantic selection
has priority. Never select an image from another request, click preference controls
automatically, or send another generation prompt to resolve alternatives. A change
of preference interrupts only the previous bitmap read. All transfer work shares
the existing operation deadline, CORS/origin/MIME/byte/pixel bounds; a body timeout
is classified separately from model generation. Popup metadata exposes only counts
and selection/transfer enums. Actual server-registration timeout remains distinct
and must be located from a live operation receipt, not inferred from a closed tab.

0.6.7 evidence: operator's first text failure is owned=true, stage=sent,
fromFresh=true, toThread=false, sameAsTab=true. It is a transient noncanonical route,
not an unconfirmed send. Reproduce root→temporary alias/placeholder→canonical thread
after the nonce was already confirmed at root. Keep ownership/path fences: the page
waits within the original deadline; the worker returns a private route-pending
receipt without binding a path or accepting a result. The same progress/result may
be delivered only after rechecking the nonce and canonical route; no new inference.
After a canonical thread is bound, any different thread remains rejected.

Clean server slugs are independently deliverable in PR386. Installing a desktop
bridge does not modify server creation code or rewrite old stored URLs.

Envelope: acknowledge an uncertain dispatch before clicking, then wait for its exact
user marker before accepting navigation or response. Resume dispatched work read-only.
Extract production JSON from the new owned response even when the model omits its
optional completion marker. Use turn identity/order rather than shifting counts;
include image tools inside their assistant article. Image mode explicitly replaces
the previous text-only instruction, requests each image separately and checks real
bitmap completion. Normal browser CORS is respected; only a visible generated image
asset may be re-read with bounded image decoding, never hidden inference endpoints.

Expose installed bridge version and sanitized stage diagnostics. No prompt, raw
response, cookie, key, account or signed media URL in diagnostics. No new shared
queue/identity/setting, schema migration, automatic paid fallback, CAPTCHA/quota bypass
or change to immutable1.7.12. Existing server actor/version/lease/Media/draft guards
remain final. No broad public UI redesign or release build/hosted workflow.

Proof: reproduce delayed navigation, then actual unpacked extension with delayed
hydration, missing/split marker, separate image tool cards, stale streaming metadata,
same-chat sequential images, interrupted delivery recovery/no resend and unrelated
draft/path fences. Real Admin plus native Production/Media persistence on disposable
PostgreSQL data is required; controlled transport remains distinct from account proof.
Ship source/ZIP together; rollback by stopping production and restoring code/bridge,
keeping all saved content and Media. Real-account diagnostic evidence must remain
explicit if unavailable.
