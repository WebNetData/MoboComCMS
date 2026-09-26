# Content and storefront UI

The content module covers `/blog`, `/blog/[slug]`, `/p/[slug]`, `/products` and `/products/[slug]`.

Page layouts are managed per page in `/admin/pages`: full width, reading width or sidebar; visible/hidden title; plain/card frame; optional published form slug. Validated settings live under `page.layout.<id>` and are saved in the same transaction as page edits. No schema change is required. Only published forms render. Article details use a full-width single column with breadcrumbs inside the shared site header.

Plan selection opens `/checkout?planId=<id>`. The name step is optional; the review step is the only step that calls the checkout API. Automatic names are generated during provisioning with the `subscriptionPrefix` setting from `/admin/settings`, defaulting to `happ`. Existing subscription names are not changed. The existing payment and delivery pipeline remains authoritative; UI checks do not reserve usernames or promise payment success.

- `src/components/content/ContentPrimitives.tsx`: shared, stateless page intro, accessible breadcrumbs and vector artwork. May be rendered on the server or imported by client components. Keep database access and checkout outside these components.
- `src/app/content-design.css`: styles scoped to `.content-surface`, using the active theme's existing variables. New page templates can reuse the same primitives without changing themes or database models.
- Page route files own published-content queries and localized fields. Blog queries are limited to ten posts, use stable ordering and preserve search/category on pagination links.
- `ShopGrid` owns interactive search and sorting. Its input descriptions are plain text, prepared on the server. Purchase behavior continues through `checkout-client`; product details remain independently linkable.
- `admin/cms/AdminCrud` is driven by `FieldDef[]`. Rich text editing is loaded only when needed; new editor fields should be introduced via definitions, with matching validation in the CMS API. Display-only fields must not bypass server authorization.

For gradual expansion, add a page template in this module, compose the primitives, and keep styles scoped. Add persistent fields only when a concrete content requirement calls for them. Themes and plugins retain the existing registries documented in `SITE-STUDIO.md`; this module does not install arbitrary executable plugins.

Verification: build and typecheck; browse empty and populated collections; combine search/category/page; follow product links; check Persian and English at narrow and wide widths. Draft pages/posts and inactive products must remain unavailable publicly. Do not submit real purchases as a visual test.
