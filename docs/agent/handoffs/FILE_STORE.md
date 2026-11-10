# File store front — 2026-11-10

Branch `feat/file-store-2026-11-10` from main. Owner: «a section in the store named فروشگاه فایل where I put files
for sale, with a very professional, advanced and attractive style and effects».

## What already existed

Products of kind VIRTUAL with `digitalMode = FILES` and `ProductFile` rows (secure delivery from the account),
a `FileStoreDoor` card and a filtered listing `?kind=VIRTUAL&files=1`; settings `showFileStore`, title, description.

## Added

- `/products?files=1` (and the old door address) is the file store's own front (`isFileStoreFront`), rendered by
  `components/store/FileStore.tsx` from `fileStoreHome()` (store catalog owner): dark «vault» hero with file kinds
  floating over a moving perspective floor, search (into the files listing), live numbers (products, files, total
  size, downloads); category chips; a spotlight; newest and best-selling grids of `FileTile`s showing file kinds,
  count, size, rating, price and downloads (never a file address); a three-step «how delivery works».
- Effects: cards tilt toward the mouse and catch light (`FileStoreTilt`, one listener, mouse only, off with reduced
  motion), entrance and scroll-in reveals only with full motion / scroll timelines. CSS Module on project tokens.
- Admin › store settings: new «نام فروشگاه فایل» (`fileStoreName`, default «فروشگاه فایل»), title, description and
  the show switch (off = the plain filtered listing). Page title/description/canonical from those settings.
- Searches and category chips use the existing listing with `files=1`. Zero-price products are not allowed by the
  store, so there is no «free files» shelf.

## Evidence (local)

store 12 (+ file store case), store-v2 16, seo 8, plus suites referencing changed files; full `tsc` clean.
`price-history` case 2 fails identically on main (`./knowledge-config` missing) — not from this branch.
Browser on six throwaway file products (deleted): 1440 light/dark and 390, header, spotlight, grids, steps, tilt
active, no page errors or overflow. Owner-reported build error (impure CSS Module selector) fixed and guarded.
