# Liona (RTL) WordPress Theme — Layout Blueprint

Reverse-engineered from the live demos of `https://rtl.pars-themes.com/liona/` (theme: **Liona**, built with Elementor + Header Footer Elementor + custom theme widgets).
This document is the **single source of truth** for the later Next.js rebuild. It is research only — no code was changed.

**Pages analysed**

| # | Page | URL | Local snapshot |
|---|------|-----|----------------|
| 1 | home-2 | `/home-2/` | `tool_0d91f5445001oaOeXP22fOwqHb` (516 KB, 4 986 lines) |
| 2 | home-5 | `/home-5/` | `tool_0d924d04a001DdA8SHEYisP8N2` (5 809 lines) |
| 3 | home-4 | `/home-4/` | `tool_0d9253131001ji8toDWwUFnoHQ` (6 903 lines) |
| 4 | Single post | `/panther-lake/?single_post_layout=single-four` | `tool_0d9252a420018tiUgVRFujHUuQ` (2 928 lines) |

Elementor CSS pulled for exact values: `post-4598.css` (home-2 page), `post-12371.css` (home-5 page), `post-9565.css` (home-4 page), `post-6149.css` (post sidebar).

> Line numbers (`L###`) below refer to the local snapshots and exist purely for traceability.

---

## 1. Global shell

### 1.1 Document

- `<html lang="fa-IR" dir="rtl">`, `<body class="rtl ... wp-theme-liona ... elementor-default">`.
- Dark mode via body class **`likhun-dark`** (every colour rule has a `body.likhun-dark …` twin).
- `body.single-post:not(.likhun-dark){background-color:#ffffff}` — post pages are always white in light mode (L2863).
- Fixed scroll-to-top pill: `.backto.progress-wrap fixed bottom-5 left-5 … bg-[--theme-main-color] rounded-full h-11 w-11`, icon `fa-angle-up`, title `بازگشت به بالا`.
- Fonts: **Yekan Bakh VF**; content column max-width **1280px** (`.container.mx-auto`), page gutters `px-4 lg:px-6 xl:px-8 2xl:px-10`.

### 1.2 Header / footer are per-demo templates (not one global header)

| Page | Header `elementor-id` | Footer `elementor-id` |
|------|----------------------|----------------------|
| home-2 | **4619** (L168–979) | **5707** (L4615–4918) |
| home-4 | **9573** (L171–994) | **9571** (L6533+) |
| home-5 | **12386** (L165–1530) | **12384** (L5471–5809) |
| single post | **6279** (L195–998) | **1856** (L2611–2853) |

So each demo ships its own header/footer variant — the rebuild must treat them as **swappable slot components**, not one hard-coded header.

**Common header anatomy** (all four variants):

1. Logo block: `<img>` logo (per-demo SVG, e.g. home-4 `logo-4-4.svg` 51×50) + brand wordmark **لیونا**
   - home-2 / home-5: brand rendered as theme widget `liona-title style1` (`<h2>لیونا</h2>`), home-2 also shows `liona-title` inside the header (L270/274).
   - home-4: plain Elementor `heading` `<h2><a>لیونا</a></h2>` (L184), `elementor-hidden-mobile`.
2. `liona-navmenu` — main menu + hamburger (`liona-sidnav-menu`, `opencloseSidNav()`, mobile-only) + `.nav-menu-wrapper.max-lg:hidden`.
   Menu shape (home-4, L196+): `خانه ▾ (خانه 1…خانه 5)` · `طرح پست ▾ (طرح پست 1…طرح پست 5)` · `نوع پست ▾ (استاندارد, ویدیو)` · `طرح دسته بندی ▾ (طرح 1, طرح 2)` · `تکنولوژی` · `بازی و سرگرمی` · `اخبار ورزشی` · `تماس با ما` · `درباره ما`.
3. Utilities, always in this order: **`liona-darkmode` → `liona-search` → `liona-off-canvas` → `liona-loginregister`** (home-4 order: search → off-canvas → darkmode → login).
4. `content-ticker` + `social-icons`:
   - home-2 & home-4: inside the header row.
   - home-5: in a **separate classic-background strip under the main header** (L896) with kicker `اطلاعیه های ما:` (content-ticker L902) + social-icons (L956).
   - post page: ticker L910, social L963.
5. home-5 only: after the strip, a **`liona-category-slider` chip bar** (L992, `#category-list-slider cat-slider-style5`, swiper, **19 chips**: icon `w-8` + label — ویدیو، مطالب فرهنگی، مسافرت، مسابقه ای، مد و فشن، ماجراجویی، کسب و کار، سلامتی، راهنمای خرید، تکنولوژی، تازه های سیاست، تازه های اقتصاد، پادکست، بازی و سرگرمی، اکشن…).
6. Breadcrumb is **not** in the header — post pages render their own (see §2.4).

**Common footer anatomy** (contents vary slightly per template):

- Optional partner `image-carousel` (home-5 L5475, home-4 L6536).
- Link columns: `لینک های مفید` + `دسترسی سریع`, each with one **or two** vertical `navigation-menu` widgets
  - home-2: two navs per column (L4675/4693 and L4717/4735)
  - home-4 / home-5 / post: one nav per column.
  - Items: `وبلاگ، سوالات متداول، تماس با ما، درباره ما` and `حساب کاربری، سبد خرید، تسویه حساب، حریم خصوصی`.
- Brand block: `liona-title style2` rendered **split** — `<h2>لیو</h2><p>نا</p>` + heading `(اخبار و اطلاع رسانی)` + `divider` + `text-editor` (lorem) + `button` (home-2/home-4 only) + `social-icons` (4 icons, `elementor-animation-grow`).
- Contact strip (4 cells, each `icon + heading(title) + heading(value)`):
  - `شماره های ارتباطی` → `021-3625148 - 09123456789`
  - `ایمیل ارتباطی / ایمیل های ارتباطی` → `support@gmail.com | info@…`
  - `آدرس شرکت / آدرس دفتر تهران` → `ایران ، تهران ، منطقه 1 (الهیه) ، زرین دوم ، پلاک هفتم`
  - home-2/home-4: 4th cell is `لیونا در رسانه ها` + `social-icons`.
  - post-page footer puts this strip **first** (L2616–2671), home-2 puts it as the **last content row** (L4783+).
- Trust block: home-2 `نماد های اعتماد ما` heading (L4756), home-5 `نماد های اعتماد ما` (L5657), post page `خدمات آموزشی ما` + sub-paragraph (L2795/2799) — all followed by **two 150×150 badges** `e-namad.png`, `samandehi2.png`.
- Bottom bar (identical element IDs in every template → literally the same sub-template): FA row `طراحی شده توسط حسن برجی` / `این وبسایت متعلق به پارس تمز میباشد و تمامی حقوق آن محفوظ است`, scroll-top icon (`elementor-animation-bob`), EN row `design by HASSAN BORJI` / `copyright 2024 pars themes . all rights reserved.`

### 1.3 JS stack observed

Slick (home-2 slider, `slick-fade`), Swiper (home-4/home-5 sliders, category sliders), Elementor **nested tabs (`e-n-tabs`)**, magnific-popup, plyr, jQuery appear/progress-wrap, `textSizeChanger()` (post font-size widget), `read-later` bookmarking (`data-id/data-link/data-title`), contact-form-7, custom Ajax register (`ajax_register`).

---

## 2. Page blueprints

### 2.1 home-2 (`elementor-4598`, page container L981+)

Accent **`--theme-main-color:#0dc4dd`** (cyan), `--global-color-primary:#020101`, `--global-color-secondary:#E7E7E7`.

**Header** (L168–979): `content-ticker` (L175) + `social-icons` (L228) → logo + `liona-title` لیونا (L270) → `liona-navmenu` → `liona-darkmode` → `liona-search` → `liona-off-canvas` → `liona-loginregister`.

**Page sections (in order)**

| # | Lines | Section title (`liona-title` style) | Body widget | Structure / measurements (from `post-4598.css`) |
|---|-------|-------------------------------------|-------------|--------------------------------------------------|
| 1 | L983 | — (hero) | `posts-slider-main` **slider-style2** | Slick, fade; 3 slides (L1061/1142/1223) + 3-thumb nav (L1308+). Full-bleed image + overlay content. |
| 2 | L1540 | **اخبار ترند تکنولوژی** (style3) + `مطالب بیشتر` heading + arrow icon | `horizontal-post-list` **style3** | Header row split 50/50 (title left, more-link right). Grid `repeat(4,1fr)`, image h **355px**, radius 9px, light-on-dark card treatment (title `#E6E6E6/#CCCCCC`), margin 30/60. **4 items** — item = thumb + `post-list-content.absolute.bottom-0.z-10` overlay (cat badge, title, excerpt, meta row: date · reading-time · arrow). |
| 3 | L1912 | **جدیدترین مطالب ما** (style3) + more-link | `posts-block-item` + `posts-block-list` ×2 | 3 columns × 33.33%: **[1 large card]** (img h **395px**, radius 20px) · **[`posts-block-list style2 has-dark`]** — dark list card, **7 items**, thumb bg `#00000080`, hover `#0DC4DD99` · **[`posts-block-list`]** — circular thumbs (85×75, radius 50px), **4 items**. |
| 4 | L2826 | **دسته بندی های لیونا** (style3) + more-link | `liona-category-slider` | Parent section bg `linear-gradient(180deg,#F4F4F4 0%,#F4F4F400 100%)`, padding-top 30px. Tiles **`w-44 aspect-[2/1]`**, radius 10px, `background-size:cover`; name 13px/800 white, sub 9px, count 11px `#9D9D9D`; prev/next swiper arrows. |
| 5 | L3146 | **نقد و بررسی ها** (style3) + more-link | `horizontal-post-list` | `repeat(4,1fr)`, image h **220px**, title 14px/700 `#434343`, excerpt `#979797`. **4 items**. |
| 6 | L3498 | **سلامتی و تغذیه** (style3) + more-link | `posts-block-item` ×2 + `horizontal-post-list` ×2 | 25 % card + 25 % card + 50 % stack of two lists, each `repeat(2,1fr)` (2 + 2 items), image h 167px → 2×2 grid on the right. |
| 7 | L4056 | **سرگرمی و ورزش** (style3) + more-link | `posts-block-list` ×3 | Rounded band `border-radius:35px`, bg `#0B99AC` + bg-image + `opacity:.84` overlay, padding 32/30 → 3 columns × `repeat(2,1fr)`, circular thumbs **95×85**, white text → **6 cards**. |

**Footer** (L4615–4918, template **5707**): brand/newsletter block → `لینک های مفید` (2 navs) + `دسترسی سریع` (2 navs) + `نماد های اعتماد ما` + 2 badges → contact strip (phone / email / address / `لیونا در رسانه ها` + socials) → bottom bar.

---

### 2.2 home-5 (`elementor-12371`, page container L1532+)

Accent **`--theme-main-color:#1581ff`** (blue).

**Header** (L165–1530, template 12386): logo + `liona-title` لیونا (L192) → `liona-navmenu` → `liona-darkmode` → `liona-search` → `liona-off-canvas` → `liona-loginregister` → **classic-bg bar** with `content-ticker` (L902, kicker `اطلاعیه های ما:`) + `social-icons` (L956) → **`liona-category-slider` style5** chip bar (L992, 19 categories).

**Page sections**

| # | Lines | Section | Widgets | Notes |
|---|-------|---------|---------|-------|
| 1 | L1534 | Hero | `posts-slider-main` **slider-style4** | **4 slides** + 4 vertical thumbnails; slide = bg-image with `:before` `linear-gradient(180deg,#3D3D3D 0%,#13111CA6 100%)` overlay, thumb nav `w-1/3`; wrapper margin `220px 0 0` (overlap under header). |
| 2 | L2233 | **آخرین اخبار** (`liona-title style2`) + `button` + `divider` | 3 × ( `posts-block-item` + `posts-block-list` ) | Groups at L2275/2350, L2506/2581, L2737/2812. Large card = `rounded-2xl`, img h **240px** radius 16px, white overlay title 14px. List = bordered card **`border:2px #DDDDDD; radius 24px`**, `rounded-xl p-3`, thumb **115px wide / 105px tall, radius 100px**, title 14px/700, excerpt 11px, meta 10px `#969696`, **2 rows each** (`tab-small-post-list`). |
| 3 | L2978 | **محبوب ترین مطالب هفته** (`style1`) + more-link | `nested-tabs` (L2989) → 3 × `horizontal-post-list` | Tabs: **همه فیلم ها / محبوب ترین ها / قدیمی ترین ها** (L2994/2998/3002). Each tab panel = `horizontal-post-list` (L3008 / 3398 / 3788) with **6 cards** (no swiper — CSS grid). |
| 4 | L4185 + L4199 | **مشاهده آرشیو بهترینها** (`style4`, centred) then **تازه ترین های** (`style1`) + `button` | 3 × `posts-block-item` | L4231 (style7), L4314 (style6), L4401 (style6) — image-led cards with overlay meta. |
| 5 | L4491 + L4508 | **مشاهده آرشیو بهترینها** (`style4`) then **اجتماعی و فرهنگی** (`style1`) + `button` (L5454) | `nested-tabs` (L4520) → 3 × `horizontal-post-list style9 card-curve-mask rounded-2xl` | Same 3 tabs (همه فیلم ها / محبوب ترین ها / قدیمی ترین ها), each panel has **4 curved cards** (L4539, 4843, 5147 ranges → 4 items each). |

**Footer** (L5471–5809, template 12384): `image-carousel` partner logos → `لینک های مفید` / `دسترسی سریع` / `لینک های مفید` heading + navs → address, phone, email cells → `نماد های اعتماد ما` (L5657) + badge images → bottom bar + `social-icons` (L5709).

---

### 2.3 home-4 (`elementor-9565`, page container L996+)

Accent **`--theme-main-color:#90c742`** (green).

**Header** (L171–994, template 9573): logo `logo-4-4.svg` (51×50) + heading لیونا (L184) → `liona-navmenu` → `liona-search` → `liona-off-canvas` → `liona-darkmode` → `liona-loginregister` → `content-ticker` (L886) → `social-icons` (L963).

**Page sections**

| # | Lines | Section | Widgets | Notes |
|---|-------|---------|---------|-------|
| 1 | L999 | Hero band | `posts-top-stories` **post-carousel_style3** | **6 slides**, full-bleed `img h 290px`, radius 0, uniform overlay `linear-gradient(90deg,#22272B99,#22272B99)`, white meta/title. |
| 2 | L1420, L1526 | Two feature cards | `liona-post-block-single-video` **style2** (`.video_large_post_single…grid.style2`) | Large image card (`img h 220px`, radius 0) with **white 20px/800** title, excerpt `#DDDDDD`, meta `#EEEEEE` — video-type posts (play badge). |
| 3 | L1635 | Promo | `image` + `liona-title style3` **معرفی پادکست های محبوب به صورت روزانه!** + `button` (L1651) | Split banner + CTA. |
| 4 | L1668 | **جدیدترین پادکست ها** (style3) + `button` (L1680) | `nested-tabs` (L1695) → 3 × `posts-top-stories` | Tabs: **کسب و کار / کتاب / فیلم و سریال** (L1701/1705/1709). Each panel = `post-carousel_style` slider with **5 slides** (L1714, 2213, 2712). |
| 5 | L3220 | — | `liona-category-slider` **style4** | Square tiles `w-20`, **8 categories**: مطالب فرهنگی، کسب و کار، تازه های سیاست، تازه های اقتصاد، بازی و سرگرمی، اخبار ورزشی، اخبار بین المللی، اخبار اجتماعی. |
| 6 | L3531 | **آخرین مقالات لیونا** (style3) + `button` (L3543) | `liona-post-block-single-video` **style4** (L3559) | Compact video cards. |
| 7 | L3688 | Hero slider | `posts-slider-main` **slider-style1** | **6 slides + 6 thumbs** (12 `swiper-slide`), thumb nav `w-2/5 max-md:w-3/12 absolute top-0 right-0`. |
| 8 | L4805 | **مطالب انگیزشی** (style3) + `button` (L4817) | `posts-top-stories` **post-carousel_style5** (L4833) | **6 slides**, `img h …` grid/section wrapper `post-grid-wrapper-section`. |
| 9 | L5259 | Promo | `image` + `liona-title style3` **معرفی پادکست های محبوب به صورت روزانه!** + `button` (L5275) | Repeat of promo #3. |
| 10 | L5292 | **پادکست های هفته** (style3) + `button` (L5304) | `nested-tabs` (L5319) → 3 tabs | Tabs: **موفقیت / فرهنگ و هنر / سیاست** (L5324/5328/5332). Each tab = **2 × `posts-block-item style4`** (L5340/5735/6130 ranges) + **`posts-top-stories post-carousel_style4` with 2 slides** (L5493, 5888, 6283). Arrows `next-arrow absolute top-1/2 right-0 translate-x-[94%]`. |

Section band #6's neighbour uses a gradient panel: `linear-gradient(180deg,#F5F5F5 0%,#FFFFFF 100%)` (element `d647ec8`); buttons here are **outlined pills** `border:2px solid var(--e-global-color-f7896b8); border-radius:100px; padding:10px 14px`.

**Footer** (L6533+, template 9571): `image-carousel` (L6536) → `لینک های مفید` + nav (L6550/6554) → `دسترسی سریع` + nav (L6574/6578) → brand block `image` + `liona-title style2 لیو/نا` + `(اخبار و اطلاع رسانی)` (L6617) + `divider` + `text-editor` + `button` (L6632) → second `لینک های مفید`/`دسترسی سریع` nav pair (L6647/6649, 6671/6673) → contact cells (phone L6712, email L6731, address L6750) → `social-icons` (L6766) → bottom bar (L6799–6815).

---

### 2.4 Single post — `?single_post_layout=single-four`

Template class: `main-container blog-single post-layout-style4 single-one-bwrap`, body `single single-post sidebar-active`.
**There IS a sidebar** (the earlier "no sidebar" assumption is wrong for this layout) — it is a 3-of-12 column aside, not a full-width article.

**Top-level grid (L1044–1048)**

```
#main-content  px-4 lg:px-6 xl:px-8 2xl:px-10
└ .container.mx-auto
   └ .grid.grid-cols-12.gap-x-8.single-blog-content
      ├ .col-span-12.lg:col-span-9   → <article id="post-4560">
      └ .col-span-12.lg:col-span-3   → post nav + #sidebar   (L1650)
```

**Order of blocks**

1. **Breadcrumb** (L1003–1041, outside the grid): pill bar `bg-neutral-200 rounded-xl dark:bg-shark-800`, items `خانه / وبلاگ / <post title>` separated by `fa-solid fa-slash-forward`, text-xs, schema.org `BreadcrumbList`.
2. **Article header** (`post-header post-header-style1 pb-5`, L1054):
   - `<h1 class="post-title single_blog_inner__Title text-2xl font-black">` (L1057)
   - `post-meta-list` row: author avatar **48×48 rounded** + `post-author-name` (`حسن برجی`) + `cat-prefix #دسته بندی:` + `news-cat_Name` pill (inline `background-color:#a100ff;color:#fff`) + Jalali date `۳۱ اردیبهشت ۱۴۰۳` + reading-time pill `rounded-2xl` `4 دقیقه`.
3. **Featured image** (L1100): `img.w-full.shadow-lg.rounded-2xl` (`803x490.webp`).
4. **Body** (`post-body py-8 blog-details-content`, L1109):
   - **text-size changer** widget (L1111): dark pill `-  اندازه متن  +`, `textSizeChanger()`.
   - `.entry-content.text-sm.leading-8.text-neutral-600` (L1118): `p.wp-block-paragraph`, `h2/h4.wp-block-heading`, `figure.wp-block-image`, `blockquote.wp-block-quote`, `ul.wp-block-list`.
5. **Tags** (L1215): `post-footer theme-tag-list-wrapp my-8 px-4 rounded-lg shadow-[0_20px_60px_0px_rgba(0,0,0,0.06)]` → `h4` **برچسب ها:** (accent colour, `before-content-#`) + tag links (`ارزش گذاری`, `تکنولوژی`).
6. **Author box** (L1227): `author_bio__Wrapper author-bio-style2 md:h-52 rounded-3xl bg-neutral-50 border border-neutral-200 mt-16 overflow-hidden`
   - thumb `w-52 md:w-64` with fade `before:` gradient
   - `h6` **درباره نویسنده** → `h4` author name (accent, 2xl/black) → description → **5 social buttons** (`w-8 bg-neutral-100 rounded-md`: Facebook, Twitter, Instagram, Pinterest, Youtube).
7. **Related posts** (L1256): `theme_related_post_Grid mt-16 mb-14`, heading row with bottom-border, `<h2>پست های <span>مرتبط</span></h2>` (accent + neutral split).
   - `.related-posts related-posts-style1 grid.grid-cols-12.gap-x-5` with **4 × `.col-span-3 max-md:col-span-6`** cards: image `rounded-2xl`, absolute bottom meta row (`#دسته بندی:` + badge + `read-later` bookmark), title `text-sm font-bold`, excerpt `hidden lg:block`, meta row (date · reading-time · arrow).
8. **Comments** (L1598): `#comments blog-post-comment comments-style-two mt-16`
   - `comment-form-wrapper bg-neutral-100 rounded-3xl p-4 md:p-6 !pb-28`
   - header row: icon + `ارسال دیدگاه` (accent, text-xl font-black) + count pill `0 دیدگاه` + subtitle `نظر شما در مورد این مطلب چیه؟`
   - `#respond` form: name / email inputs (`rounded-xl py-4 px-5`), textarea, submit `btn-comments btn-primary rounded-lg` → `ارسال دیدگاه`.
9. **Sidebar column** (L1650):
   - **Prev/next nav** (`theme_blog_navigation__Wrap blog_navigation_style2 p-7`): `پست قبلی` (neutral card `rounded-2xl shadow`) + `پست بعدی` (accent card, `bg-[var(--theme-main-color)]`).
   - `#sidebar.blog-sidebar` → Elementor **6149**:
     1. `liona-title style3` **محبوبترین مطالب** / `لیست محبوبترین مطالب ما` (L1669)
     2. `liona-category-list` **style1** — vertical list, `rounded-xl overflow-hidden`, **8 rows** (ویدیو، مطالب فرهنگی، مسافرت، مسابقه ای، مد و فشن، ماجراجویی، کسب و کار، سلامتی), each `bg-cover` row + `fa-regular fa-plus` icon, hover accent.
     3. `liona-title style3` **محبوبترین مطالب** (L1919) + `posts-block-list` → `post-block-list-style5 has-dark` card, `rounded-xl p-3`, **4 items** (thumb + title + badge + date + arrow).
     4. Banner `image` → `inst-ban.png` 809×315 (L2224).
     5. `liona-title style3` **مهم ترین عناوین** (L2240) + `posts-block-list` → **6 items** (L2246).
     6. Banner `image` → `tel-ban.png` 539×210 (L2590).

Post page footer = template **1856** (§1.2), with the contact strip placed first and `خدمات آموزشی ما` trust block.

---

## 3. Design tokens & recurring patterns

### 3.1 Tokens

| Token | Value | Where |
|-------|-------|-------|
| `--theme-main-color` | `#0dc4dd` | home-2 |
| `--theme-main-color` | `#1581ff` | home-5 |
| `--theme-main-color` | `#90c742` | home-4 |
| `--global-color-primary` | `#020101` | home-2 |
| `--global-color-secondary` | `#E7E7E7` | home-2 |
| Preloader red | `#f02006` | theme-wide |
| Category badge (technology) | `background:#a100ff; color:#fff` | all pages (inline per-term) |
| Content width | `1280px` (`.container.mx-auto`) | all |
| Page gutters | `px-4 lg:px-6 xl:px-8 2xl:px-10` | all |
| Grid | `grid-cols-12`, `gap-x-8` (page) / `gap-x-5` (related) | all |
| Font | Yekan Bakh VF (`--wp--preset--font-family`) | all |
| Direction | `dir=rtl`, `lang=fa-IR`, logical utilities (`ps/pe`, `ms/me`) | all |
| Dark mode | `body.likhun-dark` overrides (`#F4F7F7`, `#CAD4D7`, `#E3E8EA`, `#7C7C7C`) | all |
| Radius scale | `rounded-xl` (list cards), `rounded-2xl` (images), `rounded-3xl` (author/comments), `9/10/16/20/24/35px` per widget | all |
| Soft shadow | `shadow-[0_20px_60px_0px_rgba(0,0,0,0.06)]`, `shadow-[0_10px_50px_0px_rgba(0,0,0,0.08)]` | tags, prev/next |
| Hover/overlay palettes | `#00000080`, `#0DC4DD99`, `linear-gradient(to-t, rgba(0,0,0,.35), transparent 50%)` | image cards |

### 3.2 Recurring components (reusable in Next.js)

1. **`liona-title` section header** — `<div class="liona-title liona-heading_styleN"> <div class="heading-icon">…svg…</div> <h2>TITLE</h2> <p>KICKER</p> </div>`, styles 1/2/3/4.
   - Always paired with a sibling row: `elementor-heading-title` **مطالب بیشتر...** + circular arrow icon (`icon` widget, `long-arrow-alt-left`), or an outlined/filled **pill `button`**.
2. **Post card family**
   - `posts-block-item` (large, image w/ `absolute bottom-0 z-10` overlay: `cat-items` badge + `post-title` + `post-excerpt-box` + `post-meta-list`) — styles 4/5/6/7.
   - `posts-block-list` (boxed list of `tab-small-post-list` rows: thumb `pl-2.5 flex-shrink-0` + `tab-post-grid-content-small` title/meta) — styles 2/5, `has-dark` variant.
   - `horizontal-post-list` (grid of wide cards with content overlaid at the bottom) — styles 3/5/9 (`card-curve-mask`).
   - `posts-top-stories` (swiper hero/grid carousels) — styles 3/4/5.
   - `liona-post-block-single-video` (video card) — styles 2/4.
   - `posts-slider-main` (full slider) — styles 1/2/4.
3. **Meta atoms** — `post-meta-list` → `post-meta` slots: `slider-meta-date` (Jalali `DD <span class=month>MMMM</span> YYYY`), `slider-meta-time reading-time` (`N <span class=timer>دقیقه</span>`), `slider-category-box` (`cat-prefix` + `news-cat_Name`), `post-meta-readmore` (arrow link), `post-author-img/name`, `read-later` bookmark.
4. **Category surfaces** — `liona-category-slider` (style4 square `w-20`, style5 chip w/ icon, home-2 `w-44 aspect-[2/1]` tiles) and sidebar `liona-category-list style1` (vertical rows + plus icon).
5. **Tabs** — Elementor nested tabs (`e-n-tabs`), title span `.e-n-tab-title-text`, panels holding a carousel/grid; used on home-4 & home-5 only.
6. **Buttons** — pill (`border-radius:110px`), small (10px/500, `#F0F0F0` bg, `#7D7D7D` text) on home-5; outlined 2px pill on home-4; content wrapper `flex-direction:row-reverse` (RTL arrow-first).
7. **Footer cells** — `icon + heading + heading` contact unit, 4-up.
8. **Utilities used everywhere (Tailwind)** — `rounded-2xl`, `overflow-hidden`, `absolute bottom-0 z-10`, `hidden lg:block`, `max-md:*`, `justify-between items-center`, `text-neutral-*`, `dark:*`.

### 3.3 Layout recipes per page type

- **Home = full-bleed hero slider → alternating (title + more-link) content bands → footer.** Bands vary only by which card family fills them; a page is ~5–7 bands.
- **Home-5 rhythm**: `hero → 3×(big card + bordered list) → tabs → 3 cards → tabs → CTA`.
- **Home-4 rhythm**: `hero carousel → 2 video cards → promo+CTA → tabs(3×5-slide carousel) → category tiles → list → hero slider → motivational carousel → promo → tabs(2 cards + 2-slide carousel)`.
- **Post = 9/3 split**, article blocks in fixed order: breadcrumb → header/meta → featured image → text-size tool → content → tags → author → related (4×3-col) → comments; aside = prev/next → category list → 2 popularity lists → 2 banners.

### 3.4 Content inventory (copy to port verbatim)

- Nav labels: `خانه، طرح پست، نوع پست، طرح دسته بندی، تکنولوژی، بازی و سرگرمی، اخبار ورزشی، تماس با ما، درباره ما` + dropdown children as in §1.2.
- Categories: `ویدیو، مطالب فرهنگی، مسافرت، مسابقه ای، مد و فشن، ماجراجویی، کسب و کار، سلامتی، راهنمای خرید، تکنولوژی، تازه های سیاست، تازه های اقتصاد، پادکست، بازی و سرگرمی، اکشن، اخبار ورزشی، اخبار بین المللی، اخبار اجتماعی`.
- Section titles: home-2 (§2.1), home-5 (§2.2), home-4 (§2.3), post (§2.4).
- Footer/contact: `021-3625148 - 09123456789`, `support@gmail.com | info@mdrasegoftso.com`, `ایران ، تهران ، منطقه 1 (الهیه) ، زرین دوم ، پلاک هفتم`, credit rows `طراحی شده توسط حسن برجی` / `design by HASSAN BORJI`.

---

## 4. Verified / not verified

**Verified from source** — section order, widget names, item counts, tab labels, category lists, grid columns and pixel values (via `post-4598/12371/9565/6149.css`), header/footer template IDs, accent colours, RTL/dark-mode mechanics.

**Not yet extracted** — per-breakpoint (1024/767) column collapses for every section (only spot-checked), exact slick/swiper autoplay & speed settings (in theme `scripts.js`, not fetched), image sizes/crops per card style, hover animations beyond the classes quoted, and the other single-post layouts (`single-one…single-five`) — only `single-four` was captured.
