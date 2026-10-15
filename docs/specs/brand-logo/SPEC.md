# The site's own logo (2026-10-15)

The owner wanted to put their logo (with the name in it) on the site, without its background; the only place was a small square field hidden in the studio.

## What it does
- **/admin/branding** «لوگو و هویت برند» (menu: Design & pages; permission `settings.manage`, the same as the studio, saved through `/api/admin/site`).
  - **Wide logo** (`SiteConfig.wordmark`): replaces the mark and the name in every header and panel.
  - **Dark version** (`wordmarkDark`, optional): shown on dark pages; both images are in the page and CSS shows the right one, so nothing flashes.
  - **Square mark** (`logo`, unchanged meaning): mini app, small places, structured data.
  - **Height** (`wordmarkHeight`, 24–72 px, default 40) with a live light/dark header preview.
- **Background removal in the browser** (`src/app/admin/branding/background.ts`, pure):
  - the background colour is read from the four corners (only when they agree);
  - pixels close to it become transparent, those a little further fade (soft edges);
  - by default only background connected to the edges is removed, and «داخل حروف» also clears enclosed areas (inside an "O");
  - empty margins are cropped;
  - the result is checked on see-through, light and dark backgrounds, then uploaded as PNG; the server stores WebP and keeps the alpha.
- Drawn through `src/components/site/SiteLogo.tsx`:
  - `Wordmark` for themes, through the theme SDK as `ThemeWordmark` (mobocom, clean, orbital header and footer);
  - the default header;
  - `BrandLockup` for the admin, account, reseller and seller panels and the welcome page.
- The studio's logo field points to the new page.

## Acceptance
- Unit: `scripts/brand.test.cjs` (corner colour, edge-connected and everywhere removal, crop box, validation of the new fields, every header and panel wired).
- Browser with the owner's own logo (`.mobocom/claude-tools/pw-brand.cjs`, 11): the navy background found and removed (corner transparent, > 30 % clear, cropped), saved, the header shows the logo at the chosen height in light and dark with no name beside it, it fits a phone, and it is in the admin and account side bars.

## Note for the owner
A logo drawn for dark backgrounds (silver letters) is faint on the light theme. Upload a version with dark letters as the main logo and keep this one as the dark version.
