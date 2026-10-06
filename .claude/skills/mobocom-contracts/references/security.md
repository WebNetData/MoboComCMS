# Security & Trust Boundary Reference

Load for privileged, upload, plugin, update, payment, auth, webhook, filesystem, remote-fetch or user-generated-content work.

## Trust boundaries
Validate data entering from:
- browser/client
- external webhook
- imported file
- uploaded media
- remote URL
- plugin package
- admin advanced-code features
- environment/provider responses

## Authorization
Use narrow permissions and resource policies. `settings.manage` must not become a universal code-execution/update privilege.

## Plugins
Server plugins are trusted code unless a real sandbox exists.
Installation/update requires a highly privileged capability and audit event.

## Themes
Pure themes should not gain server code execution.

## Uploads
Enforce streaming limits independent of Content-Length, validate magic/type, safe names/storage, authorization and rate limits.

## Remote fetch
Protect against SSRF: protocol rules, DNS/private-address checks at connect time, redirect revalidation, timeouts and byte limits.

## Rich content
Sanitize at trusted boundaries. Structured-data JSON must be safely serialized for HTML context.

## Webhooks
Verify signatures on bounded raw bodies as required, prevent replay where provider supports it, use idempotency for payment/order effects.

## Filesystem
Lexical root checks are insufficient when symlinks exist. Resolve/enforce real path containment for sandboxed roots.
