# Prompt gallery assets — 2026-11-01

These are original demonstration assets, not assets copied from the reference website. The exact prompts are the `example` fields in [prompt-gallery.json](../../../prisma/starter-content/prompt-gallery.json); the public detail page displays that same text. `showcase.caption` and `showcase.credit` disclose the method. Names of destination tools are compatibility choices for instructions, not proof that a particular provider rendered a sample.

| Asset in the repository | Source and method |
|---|---|
| `public/images/prompts/blueprint.webp` | Built-in image generation tool, original automotive concept/technical-sketch prompt (`design-blueprint-gt`). Fictional dimensions are not engineering specifications. |
| `public/images/prompts/character.webp` | Built-in image generation tool, original scrapbook character prompt (`sketchbook-character`). |
| `public/images/prompts/perfume.webp` | Built-in image generation tool, original unbranded product prompt (`amber-perfume-editorial`). |
| `public/images/prompts/orbit.webp`, `orbit.webm` | Authored six-second silent Canvas animation and poster (`orbit-motion-study`), not a video-model output. |

The three generated PNG originals are retained in the creator's local generated-image artifact directory, outside Git. Published WebP derivatives use the existing Sharp dependency for format/size compression. This does not require a product API key or add an image generation service to MoboCom. Combined deployed byte size is measured in the handoff.

`scripts/build-prompt-motion.cjs` documents the original animation implementation. To reproduce in a disposable checkout with the repository's Playwright dependency, run `node scripts/build-prompt-motion.cjs`; optionally set `PLAYWRIGHT_CHROMIUM_PATH` to the installed browser. It refuses to overwrite an existing video. Timing/compression can differ by browser.

Text and React-code samples are authored literal examples. Landing/dashboard previews are fixed React/CSS compositions under `src/components/prompts/WebPreview.tsx`; illustrative dashboard numbers are labeled as demonstrations. They do not render arbitrary stored code and are not screenshots of a customer site or verified model output. All sample entries are normal Admin-editable PromptTemplates.

Measured deployed sample assets: **1265013 bytes** total (three image WebPs, one video poster and one WebM). This is file size, not measured network transfer or end-user latency.
