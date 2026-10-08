---
name: Organized Glitter
description: A multi-craft project tracker for hobbyists who actually finish things.
colors:
  primary: '#d13d78'
  primary-dark-mode: '#f58ab5'
  accent: '#8535d4'
  accent-dark-mode: '#caa4f9'
  destructive: '#ca2b2b'
  destructive-dark-mode: '#ca2b2b'
  destructive-text-dark-mode: '#f17e7e'
  link-dark-mode: '#f58ab5'
  background: '#f8e8f6'
  background-dark: '#151533'
  foreground: '#48333f'
  foreground-dark: '#f7f2f7'
  card-light: '#fdf6f9'
  card-dark: '#231e3e'
  muted: '#f2e3eb'
  muted-dark: '#2d2749'
  muted-foreground: '#765669'
  muted-foreground-dark: '#beb1c3'
  border: '#e5cdd9'
  border-dark: '#474059'
  aurora-purple: '#a276da'
  aurora-pink: '#e35da8'
  aurora-blue: '#a464d4'
  aurora-teal: '#29ab97'
typography:
  display:
    fontFamily: 'Caveat Variable, Caveat, cursive'
    fontSize: 'clamp(1.875rem, 4vw, 2.5rem)'
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'Karla, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Karla, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 'normal'
  body:
    fontFamily: 'Karla, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 'normal'
  label:
    fontFamily: 'Karla, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '0.04em'
  mono:
    fontFamily: 'JetBrains Mono Variable, ui-monospace, SFMono-Regular, monospace'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
rounded:
  sm: '8px'
  md: '10px'
  lg: '12px'
  panel: '16px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '36px'
  button-primary-hover:
    backgroundColor: '{colors.accent}'
    textColor: '#ffffff'
  button-glass:
    backgroundColor: '{colors.card-light}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '36px'
  button-glass-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '36px'
  panel:
    backgroundColor: '{colors.card-light}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.panel}'
    padding: '24px'
  chip-status:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: '4px 10px'
    height: '24px'
  input-field:
    backgroundColor: '{colors.card-light}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '36px'
---

# Design System: Organized Glitter

## 1. Overview

**Creative North Star: "The Quiet Notebook"**

Organized Glitter is a personal notebook for crafters, rendered as a quietly polished iOS/macOS-feeling app. The product app register treats the page as the surface; content lives on it directly. Glass panels appear when product content needs to be grouped into a controllable region (settings, filters, form sections), not when the designer wants something to look interesting. The dominant product register is restraint: the app earns its visual interest through typographic warmth, section rhythm, and a single purple voice, not through ornament.

Surface rules are split by register, not relaxed globally:

- **Product app register:** Authenticated app surfaces, including dashboards, project pages, forms, settings, and auth-adjacent product chrome. Use semantic tokens, strict glass rules, flat default surfaces, one Caveat page-title moment, and restrained purple accents.
- **Marketing paper register:** The public home page may use paper, washi, scrapbook composition, Caveat accents, and material texture gradients only in the marketing subtree and `src/styles/scrapbook.css`.
- **Public utility register:** `/links` is Sarah/brand utility chrome. It uses the selected Light or Dark palette mapped through semantic tokens, flat link blocks, and Karla typography. It does not use glass, paper, or gradients.

Product app bodies use a viewport-fixed atmosphere that matches the native iOS app in Light (blush-to-lilac wash) and keeps a quieter navy-plus-lavender stage in Dark. `/links` stays a flat utility surface. The older four-bloom "aurora" tokens remain retired; `.aurora-bg` is now a transparent layout hook. Product visual interest still comes from typography, section rhythm, and the single berry primary voice, not from chrome gradients. Marketing paper texture is a separate public-home material.

The product app register rejects the literal craft-store aesthetic (scrapbook fonts, bows, glitter graphics, chalkboard textures), generic SaaS dashboards (hero KPI tiles with gradient accents, "engagement" framing), and AI-slop tells (gradient hero text, identical card grids, drive-by glassmorphism, side-stripe colored borders). The "Glitter" in the name is a wink, never a visual instruction. The home page's scrapbook language is a scoped marketing register; it must not leak into app chrome. `/links` is a brand utility page, not a social profile product feature.

The product app is berry-led but not berry-drenched. Berry Cream Light uses a berry primary (`hsl(336 62% 53%)`) with purple reserved for selected states and deliberate emphasis. Berry Cream after dark uses a lighter raspberry primary (`hsl(336 84% 75%)`) and a lavender accent. Primary should appear on roughly 10% or less of any screen. Surfaces are flat by default; the page atmosphere is the only product-body gradient. Depth in grouped regions still comes from glass translucency and section rhythm, not from extra chrome gradients.

**Key Characteristics:**

- Restrained, iOS/macOS-feeling product app chrome; the page is the surface.
- Glass panels (`<GlassPanel>`) as the canonical grouped-region container in the product app; flat content lists outside panels by default.
- Flat content lists and grouped glass regions; product page atmosphere is a documented body exception, while home paper texture stays in the marketing register.
- Caveat is a product page-title moment and a marketing paper accent; `/links` uses Karla.
- Purple accent used sparingly; status conveyed by hue plus label plus icon, never hue alone.
- Product section rhythm both inside panels and on flat regions: lowercase semibold heading prefixed with a 2px × 22px primary dash, hairline `border-border/60` dividers, `pt-6` rhythm.
- Cross-theme parity: dark and light are equal first-class citizens, not light-with-an-inverter.

### Current Surface Registers

- **Product app register:** Authenticated personal library pages, app dashboards, project detail/edit flows, settings, overlays, and product utilities. These stay on semantic tokens, product glass rules, product typography, flat-by-default surfaces, and privacy-first app chrome.
- **Marketing paper register:** The public home page (`HomeHero` plus `TwoCraftsSplit`, `ScrapbookFeatures`, `SarahSignature`, and marketing preview assets directly referenced by that page). It may use Paper Register tokens, washi tape motifs, Caveat accents beyond the H1, and material texture gradients in `src/styles/scrapbook.css`. Do not broaden this to product app surfaces.
- **Public utility register:** `/links`, a Sarah/brand public utility page. It uses the selected Light or Dark palette, plus flat semantic link blocks. It prohibits glass, paper, washi, gradients, and social-profile patterns.

### Current Product Surfaces

- **Library:** The app-level collection surface at `/dashboard`. `DashboardShell` owns the Caveat H1, the craft segmented control, and the single New project action. Diamond, coloring book, and coloring page panes share the same sidebar/content structure: filters in one glass sidebar on desktop, flat result lists or grids on the content surface, and mobile filters in a drawer.
  - The user-facing name is Library. The `/dashboard` route and Dashboard-prefixed code, saved keys, and analytics events retain their existing names for compatibility.
- **Randomizer:** A focused decision surface, not a dashboard. One main `<GlassPanel>` contains craft choice, eligibility filters, wheel, and result. Desktop target selection and spin history sit as flat adjacent regions with hairline dividers; mobile folds target selection into the main panel below the wheel. The wheel is a deliberate full-palette data-visualization exception, with pattern overlays and a key so color is never the only signal.
- **Coloring books:** A library branch inside the same project tracker, not a separate app. Book detail pages use a cover-led flat header, quiet ghost chrome, `SectionHeading` region markers, a dense page grid, and inline notes/tags. Mystery status is a small primary chip, never a hidden-card gimmick.
- **Coloring pages:** A progress-capture surface. The artwork/photo canvas stays large and flat; editing affordances live in one right-rail `<GlassPanel>` for status, dates, mediums, and mystery reveal. Page photos default to preserving the whole page because they are documentary records first.

### Current Public Surfaces

- **Public `/updates/` blog:** The Astro blog extends the marketing paper register to `blog/src/`. Match the main site's signed-out header and footer, including the Caveat wordmark and theme control. Use the existing WordPress blog as the editorial reference: a large handwritten hero, the approved craft photo, cream recent-post sections, and paper signup treatment. Post bodies remain readable Karla text. This is an explicit exception to the home-only scope below; it does not extend paper styling to product pages or `/links`.
- **Public home marketing page:** The home page uses the marketing paper register to explain the product through warm paper, washi, Caveat accents, and scrapbook composition. Its Paper Register tokens and texture gradients are scoped to `src/components/marketing/**`, `src/styles/scrapbook.css`, and marketing preview assets explicitly referenced by the home page.
- **Public `/links` page:** `/links` uses the public utility register. It is a flat surface for Sarah/brand links, built from the selected theme’s semantic tokens and anchor blocks. It is not a user-profile feature, and it does not adopt home paper materials or product glass.

## 2. Colors: The Restrained Palette

The two appearance modes use distinct palettes through the same semantic roles. Berry Cream Light uses warm pink surfaces, berry actions, and a purple accent. Berry Cream after dark uses a deep navy stage, raspberry actions, and a lavender accent. Components consume semantic tokens so the interaction language stays consistent across both modes.

### Primary

- **Primary** (light: `hsl(336 62% 53%)`; dark: `hsl(336 84% 75%)`): The main saturated voice of each palette. Use it for primary buttons, the active lozenge inside `SegmentedControl`, focus rings, and accented bottom-nav slots. Light uses Berry Cream's berry tone; Dark uses the matching raspberry on the navy stage.

### Accent

- **Accent** (light: `hsl(270 65% 52%)`; dark: `hsl(267 88% 81%)`): Reserved for selected states and deliberate emphasis. Light uses brand purple and Dark uses a lighter lavender. Generic Light hover and highlighted-option surfaces use `secondary`, not `accent`.

### Status & Destructive

- **Destructive Red**: Filled controls use `hsl(0 65% 48%)` in both themes. Standalone danger text uses the same red in Light and `hsl(0 80% 72%)` in Dark through `text-destructive-text`. Filled controls pair with `text-destructive-foreground`.

### Page Atmosphere

The product page is not a flat fill. `.page-atmosphere` is a viewport-fixed layer behind the app:

- **Light:** a top-to-bottom blush-to-lilac wash (`hsl(340 79% 96%)` through `hsl(308 52% 94%)` to `hsl(259 74% 93%)`).
- **Dark:** the navy `--background` stage with a quiet lavender bloom at `50% 118%` (`hsl(271 28% 52% / 0.45)` to `hsl(270 26% 34% / 0.22)`, then transparent). The bloom stays below the saturation of the grape iOS hotspot so it reads as atmosphere, not a spotlight.

The geometry stays with the viewport. Content height must not move or stretch it. Sticky header and bottom nav stay translucent (`bg-background/90` plus blur) so the atmosphere reads through chrome. `/links` adds `utility-register` on `<html>` so `.page-atmosphere` drops its image and `.mobile-app-container` paints `bg-background`, covering safe-area padding that would otherwise leak wash or bloom. Do not put matching gradients on buttons, panels, chips, headers, or hover states.

### Aurora Tint (deprecated)

The older four-bloom aurora tokens (`aurora-purple`, `aurora-pink`, `aurora-blue`, `aurora-teal`) and the `.aurora-bg` class name are leftover from a previous body treatment. `.aurora-bg` is now a transparent layout hook. The aurora swatches in the frontmatter stay archival. Do not paint those tokens onto chrome.

### Neutrals

- **Background** (`hsl(308 52% 94%)` light; `hsl(240 42% 14%)` dark): the solid color under the page atmosphere, and the fallback overscroll color. Dark navy is lifted from the iOS `#05051A` stage so larger screens stay readable.
- **Card Surface** (`hsl(338 67% 98%)` light; `hsl(250 34% 18%)` dark): card surfaces and the solid color beneath glass layers. Popovers use the same Light value and `hsl(248 38% 16%)` in Dark.
- **Foreground** (`hsl(324 17% 24%)` light; `hsl(300 24% 96%)` dark): primary text.
- **Muted Foreground** (`hsl(324 16% 40%)` light; `hsl(283 13% 73%)` dark): section labels, helper copy, and secondary metadata.
- **Border / Hairline** (`hsl(330 32% 85%)` light; `hsl(256 16% 30%)` dark): borders, dividers, inputs, and section-rhythm hairlines.

### Glass Tokens (layered surfaces only)

Glass surfaces use HSL-with-alpha tokens that layer over whatever sits behind them:

- **Glass Background**: `hsl(338 67% 98% / 0.85)` light, `hsl(250 34% 18% / 0.74)` dark.
- **Glass Border**: `hsl(324 17% 24% / 0.1)` light, `hsl(300 24% 96% / 0.1)` dark. Hairline.
- **Glass Highlight**: `hsl(0 0% 100% / 0.6)` light, `hsl(300 24% 96% / 0.12)` dark. 1px inset top edge that provides the glass top-light reflection.

### Paper Register (marketing surfaces only)

A material sub-palette used by the home page scrapbook surfaces (`HomeHero` subtree: `TwoCraftsSplit`, `ScrapbookFeatures`, `SarahSignature`). The photo frame, craft sheet, and washi tape retain their paper identity; against the navy stage the paper shifts to a warmer toasted cream.

The features sheet and Sarah signature card preserve the scrapbook typography, layout, and tape while adapting their surfaces and ink to the selected theme. In Dark, these two cards locally map `--paper-bg` and `--paper-bg-warm` to `--card`, `--paper-edge` to `--border`, `--paper-fg` to `--card-foreground`, and `--paper-muted` to `--muted-foreground`. Sarah's heading and link use `--accent` in Dark. Light retains the paper colors below. These overrides stay in `src/styles/scrapbook.css` and do not change other paper consumers.

**Paper surfaces and ink (light, with dark-mode cream softening):**

- `--paper-bg`: `hsl(338 67% 98%)`; softens to toasted cream `hsl(36 38% 85%)` in `.dark`.
- `--paper-bg-warm`: `hsl(340 71% 99%)`; softens to `hsl(38 42% 88%)` in `.dark`.
- `--paper-edge`: `hsl(330 32% 85%)` dividers; softens to `hsl(35 22% 78%)` in `.dark`.
- `--paper-fg`: `hsl(324 17% 24%)` ink.
- `--paper-muted`: `hsl(324 16% 40%)` body copy on paper.
- `--paper-list`: `hsl(324 17% 32%)` tighter list copy.

**Public home background:**

- `--marketing-bg-start`: `hsl(340 79% 96%)`.
- `--marketing-bg-middle`: `hsl(308 52% 94%)`.
- `--marketing-bg-end`: `hsl(259 74% 93%)`.

These named Paper Register tokens form the Light home-page gradient. Dark lets the product page atmosphere show through behind the paper surfaces.

**Washi tape palette:**

- `--washi-sage`: `hsl(151 49% 87%)`.
- `--washi-peach`: `hsl(342 84% 90%)`.
- `--washi-sky`: `hsl(228 80% 91%)`.
- `--washi-butter`: `hsl(43 92% 86%)`.
- `--washi-dusty`: `hsl(276 72% 91%)`.
- `tape--lav` is computed from `hsl(var(--primary) / 0.55)`. It intentionally bridges the marketing register into the brand's primary purple at low alpha.

Use these tokens only inside `src/components/marketing/**`, `src/styles/scrapbook.css`, and marketing preview assets explicitly referenced by the home page. Product surfaces (the app, dashboards, project lists) must stay on the regular themed tokens. The Paper register is a sub-system; it is not a second design system.

### Public Utility Register: `/links`

`/links` inherits the selected site theme, with System as the default for new visitors. Both palettes use semantic token roles (`background`, `card`, `foreground`, `muted`, `border`, `primary`, `link`) rather than becoming a separate component language. Link entries are flat semantic anchor blocks with clear focus, hover, and touch states.

The `/links` register does not use `GlassPanel`, paper tokens, washi tape, Caveat accents, aurora tokens, or gradients. It marks `html` with `utility-register` so the padded app shell stays an opaque `background` fill and the page atmosphere does not show in safe-area insets. It is public Sarah/brand chrome, not an Organized Glitter user-profile surface.

### Named Rules

**The One-Voice Rule.** Primary appears on no more than 10% of any screen. Multiple primary CTAs in the same viewport is a design failure; the secondary should be `variant="glass"`, never a second filled `variant="default"` button.

**The No-Gradient Rule.** Product UI gradients remain banned on chrome. No `linear-gradient`, `radial-gradient`, or `conic-gradient` may appear on buttons, panels, chips, headers, dividers, text, hover states, or focus states. The one product-body exception is `--page-atmosphere`, painted only on `.page-atmosphere`: the Light blush-to-lilac wash and the Dark navy-plus-lavender bloom. Other allowed exceptions stay narrow: the image scrim for controls over photos, the progressive placeholder shimmer, paper/washi texture gradients in `src/styles/scrapbook.css`, and non-shipped design previews under `docs/design-previews`. `/links` does not use gradients.

**The Hue-Plus-Label-Plus-Icon Rule.** Status states (Wishlist, In Stash, In Progress, Completed, Archived, Destashed) never communicate by hue alone. Every status chip carries an icon and a text label so the meaning survives color-blindness, low contrast, and `prefers-contrast: more`.

**The No-Alpha-White Rule.** `bg-white/*`, `border-white/*`, `shadow-white/*`, and `rgba(255, 255, 255, …)` are forbidden as glass-surface treatments. Use the `--glass-bg`, `--glass-border`, and `--glass-highlight` tokens; they degrade across themes correctly. Alpha-white does not.

## 3. Typography

**Display Font:** Caveat Variable (with Caveat, cursive fallback). Product page-title and marketing-paper accent only.
**Body Font:** Karla (with `ui-sans-serif`, `system-ui`, `sans-serif` fallback). Product body text, product headings below H1, and all `/links` typography.
**Mono Font:** JetBrains Mono Variable (with `ui-monospace`, `SFMono-Regular`, `Menlo` fallback). Verbatim technical strings only.

**Character:** Karla is a humanist sans with friendly round counters; Caveat is a casual handwritten script. In the product app, the pairing reads as "a thoughtful person taking notes": restrained body copy with one moment of warmth where the page title lives. In the marketing paper register, Caveat may act like hand-labeled paper. `/links` stays Karla so the public utility surface reads crisp and scannable. JetBrains Mono shows up for image filenames, dimensions, and any value the user is meant to read literally.

### Hierarchy

- **Display** (Caveat, weight 500, `clamp(1.875rem, 4vw, 2.5rem)`, line-height 1.05, letter-spacing -0.01em): Product page H1 by default. `<h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">`. On product app pages, never use Caveat on H2/H3; those revert to Karla. Exception: project create/edit form headers may use a small rotated Caveat state label (`Adding`, `Editing`) above a Karla H1 so the actual project title stays readable. Marketing home may use Caveat for overlines, tape labels, feature titles, scribble accents, and Sarah note text. `/links` uses Karla instead of Caveat.
- **Headline** (Karla, weight 600, 1.5rem, line-height 1.2, letter-spacing -0.01em): Section heads inside long-form pages (About, Privacy, Terms), modal titles, hero card titles in lists.
- **Title** (Karla, weight 600, 1.125rem, line-height 1.35): Project card titles, dialog headers, prominent list-row primary text.
- **Body** (Karla, weight 400, 0.9375rem, line-height 1.55, max line length 65 to 75ch on prose pages): Default text. Form values, list-row copy, paragraph content, tooltips, helper text.
- **Section Heading** (Karla, weight 600, 0.875rem, line-height 1.4, `tracking-tight`, sentence case): The product app `<h2>` / `<h3>` that marks a page region (In progress, Filters, Timeline, Notes, Progress, Details, Source URL, Tags). Product page-region headings are paired with a 2px × 22px `bg-primary` dash separated by `gap-2.5`. Class: `text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight`. The dash plus heading is a **region marker**, used once per region; subsections inside the region revert to plain semibold without a dash. Marketing home and `/links` may use their own restrained headings instead of this product marker.
- **Mono** (JetBrains Mono, weight 400, 0.8125rem, line-height 1.5): Source URLs, dimension values, kit IDs, anything verbatim.

### Named Rules

**The Single-Display Rule.** Product app pages use one Caveat moment, normally the H1. Hero counters that deserve emphasis (e.g. "127 projects") may use Caveat as a deliberate signature moment, but only if there is no Caveat H1 above them. The standing product exception is project create/edit forms: a small rotated Caveat state label (`Adding`, `Editing`) may sit above a Karla H1 because the title can be user-generated, long, and better served by Karla. Marketing home has the Paper Register exception for overlines, tape labels, feature titles, scribble accents, and Sarah note text. `/links` uses Karla.

**The 16px-on-Mobile-Inputs Rule.** Form inputs on mobile use `font-size: 16px` (already enforced in `src/index.css`) to prevent iOS Safari's zoom-on-focus behavior. Don't override this with smaller input text on phone surfaces.

**The Karla-on-Headings Rule.** Product H2 to H6 and `/links` headings use Karla `font-semibold tracking-tight` (already set in the base layer). Don't reach for Caveat on product H2s to "carry the brand voice deeper"; the product brand voice is restraint plus one moment of warmth, not script-everywhere. Marketing paper surfaces use their documented Caveat accent exception.

**The Page-Header-Caveat Rule.** Product app page H1 uses `font-handwritten text-3xl leading-tight tracking-tight md:text-4xl` and is paired with an optional muted subline below, such as the date on Overview or a contextual breadcrumb on project pages. The H1 sits in a flex header alongside the avatar (Overview) or back button (project pages), never inside a panel. Exception: project create/edit form headers use a Caveat state label above a Karla H1 for the editable project title. Marketing home follows the Paper Register. `/links` uses a Karla heading.

**The Section-Heading-Style Rule.** Product page-region headings are `text-foreground text-sm font-semibold tracking-tight` in sentence case, prefixed with a 2px × 22px `bg-primary rounded-sm` dash separated by `gap-2.5`. The whole heading is rendered as `inline-flex items-center`. This replaces the prior eyebrow style (uppercase, `tracking-[0.14em]`, `text-[11px]` or `text-xs`). The eyebrow is now a banned product-app pattern: see Don'ts. Marketing home and `/links` may use their own restrained heading systems.

**The Region-Marker-Not-Eyebrow Rule.** The dash plus heading marks a _page region_, not a _category label_. Use it once per region. Subsections inside a region (a sub-header within Notes, a label inside Timeline) revert to plain `font-semibold` with no dash. If you find yourself stamping the dash onto every label, you are using it as an eyebrow, which is the SaaS-template tell we're avoiding.

## 4. Elevation

Product app depth comes primarily from **glass translucency and inset highlights**, with a small, deliberate set of conventional shadows underneath. Glass panels float on the body via translucency and an inset top highlight that fakes ambient light catching the panel edge; that's the structural lift. Conventional `box-shadow` is used sparingly: under interactive surfaces that need to feel pressable (`glow-hover`), and on the panel itself to anchor it against the page.

Product app and public utility surfaces are flat at rest by default. Lists, project rows, status chips, link blocks, and form fields sit directly on the page or inside a product panel without per-item shadow. Shadows appear as a response to state (hover, focus, lift on tap), never as a baseline decoration. Home marketing paper may use material shadows only inside the Paper Register.

### Shadow Vocabulary

- **Panel rest** (`box-shadow: inset 0 1px 0 hsl(var(--glass-highlight)), 0 10px 30px rgba(0,0,0,0.08)` light, `0 16px 40px rgba(0,0,0,0.35)` dark): The default `<GlassPanel>` shadow. The inset highlight is the iOS top-light reflection; the outer shadow is diffuse and low-contrast. Already baked into the primitive; don't reapply.
- **Glass-button rest** (`inset 0 1px 0 hsl(var(--glass-highlight)), 0 2px 8px rgba(0,0,0,0.08)`): Glass buttons for secondary panel actions, filter chip groups, and form footers. Top-bar Back/Edit/More chrome is ghost, not glass.
- **Glass-button hover** (`inset 0 1px 0 hsl(var(--glass-highlight)), 0 4px 14px rgba(0,0,0,0.12)`): The lift on hover; pairs with `brightness-110`.
- **Glow hover** (`0 0 12px hsl(var(--primary) / 0.08), 0 2px 8px rgba(0,0,0,0.06)` light, `0 0 20px hsl(var(--primary) / 0.18), 0 4px 12px rgba(0,0,0,0.25)` dark): Primary-tinted halo on `.glow-hover` cards. Used on project cards in grid view; the halo signals "this card is interactive" without changing its rest state.
- **3D glass** (`inset 0 1px 0 hsl(var(--glass-highlight)), 0 10px 30px rgba(0,0,0,0.08)` plus `outline: 1px solid hsl(var(--glass-border))`): The `.glass-3d` Apple-style hero treatment. Rare. Use only on a featured page-level glass surface, not on stacked panels.

### Named Rules

**The Flat-By-Default Rule.** Product app and `/links` surfaces are flat at rest. Shadows are a response to state (hover, focus, drag), not a baseline ornament. If the same shadow appears on every app list item or utility link block, it's wrong.

**The One-Panel-Per-Region Rule.** Within a single product app page region, render at most one `<GlassPanel>`. Stacking panels inside panels (a glass panel containing three glass mini-panels) is the "card slop in glass" failure mode. Use the `Section` helper with hairline dividers inside one panel instead. Home marketing paper surfaces and `/links` do not need `GlassPanel`.

**The Translucent-Not-Layered Rule.** Glass earns its depth from translucency and a 1px inset highlight, not from stacked drop shadows or a gradient backplate. If a panel needs to feel "more elevated," reach for the existing `.glass-3d` treatment, not a custom box-shadow stack or a gradient behind it.

## 5. Components

### Buttons

- **Shape:** Gently rounded (`rounded-md` = 10px). Square corners are wrong here; pill shapes (`rounded-full`) are reserved for chips and the segmented-control lozenge.
- **Primary** (`variant="default"`): `bg-primary` berry in Light and raspberry in Dark, with `text-primary-foreground` (white in Light, dark navy-berry in Dark), height 36px (`h-9`), padding `px-4 py-2`. Hover: `bg-primary/90`. Used for the single high-emphasis action per region (Save, Continue, Spin).
- **Glass** (`variant="glass"`): The default canonical button when on or near a `<GlassPanel>`. Translucent surface with the same inset-highlight shadow signature as the panel itself. Used for secondary actions inside glass contexts (filter chip groups, panel-anchored toolbars). Banned in two contexts: top-bar page chrome (per **Page-Chrome-Quiet**) and low-priority footer actions in flat regions (per **Footer-Action-As-Text-Link**).
- **Glass Destructive** (`variant="glass-destructive"`): `bg-destructive` red with `text-destructive-foreground` and an inset highlight. Both themes use an opaque fill for readable labels. Used for inline destructive actions (Remove image, Delete tag) and rare destructive page-CTAs. For `<AlertDialog>` confirms, the variant prop is dropped by shadcn; apply the className workaround documented in the `shadcn-alertdialogaction-variant-prop-ignored` skill.
- **Outline / Ghost / Secondary / Link**: Standard shadcn variants. Outline carries `shadow-xs`; ghost is hover-only fill; link is `text-link` with hover underline. Used in low-emphasis chrome (filter clear, "see all" rows, link footers).
- **Sizes:** `default` (h-9), `xs` (h-6), `sm` (h-8), `lg` (h-10), `touch` (h-11), and icon variants (`icon`, `icon-xs`, `icon-sm`, `icon-lg`, `icon-touch`). Phone surfaces default to `touch` or `icon-touch` (h-11) so primary actions clear the 44px touch-target floor.
- **Touch-target safety net:** A global rule in `src/index.css` enforces `min-height: 44px` on every `<button>` under `@media (hover: none) and (pointer: coarse)` (real touch devices), so any size token below `h-11` still passes the iOS guideline on phones and touch tablets. `Button asChild` renders the child element (often `<a>` via `<Link>`), which the rule's `button` selector doesn't match. The shared `Button` adds a 44px minimum height and width to its `asChild` output on coarse pointers, including compact back links and icon links.
- **Hover / Focus:** All buttons share `transition-all`, `outline-none`, and a 3px focus ring (`focus-visible:ring-ring/50`). Focus is always visible; never `outline: none` without a replacement.

#### Named Rules

**The Footer-Action-As-Text-Link Rule.** Low-priority footer actions inside content regions render as primary-underlined text links, not glass buttons. Canonical class: `text-foreground decoration-primary/50 hover:decoration-primary text-sm font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none`. Applies to: Show more / Show less toggles, "Manage all your X →" handoffs, inline-edit Save / Cancel pairs, "Clear all" inside results bars. Keep solid `variant="default"` for primary actions (Submit, Save, Add new project) and `variant="outline"` for destructive confirmations. Glass buttons stay reserved for chrome that sits on or near a glass surface.

**The Page-Chrome-Quiet Rule.** Navigation and secondary actions in a page's sticky top bar (Back, Edit, overflow trigger) render as `variant="ghost"` buttons, not glass pills. Reason: a glass pill in the top-left visually outweighs the page H1, even though hierarchy says the H1 should be the first read. Ghost disappears against `bg-background/85` until hovered, restoring the H1 as the primary visual anchor and letting the three top-bar affordances (Back, Edit, More) read as a peer group of quiet chrome. Reserve solid `variant="default"` for the single primary in-page action (Save, Submit, Add new project) and `variant="outline"` for destructive confirmations. The matching `Don't` is below.

### Glass Panel: `<GlassPanel>`

The signature grouped-region container of the product app register. It is not required for home paper surfaces or `/links`.

- **Corner Style:** `rounded-2xl` (16px). Softer than buttons because panels hold content; the radius signals "container", not "control".
- **Background:** `bg-[hsl(var(--glass-bg))]`; translucent card white at 85% in light, dark navy card at 74% in dark.
- **Border:** Hairline (`border border-[hsl(var(--glass-border))]`) at 8% alpha. The border is a whisper, not an outline.
- **Shadow Strategy:** Inset top highlight plus low-contrast outer drop. Already on the primitive; never override or reapply on the parent.
- **Backdrop:** `backdrop-blur-xl backdrop-saturate-150`. The saturation boost preserves color fidelity when content sits behind glass, so glass refraction reads as real material rather than as a flat blurred photograph.
- **Internal Padding:** Caller's choice; `p-4` for tight panels, `p-6` for default, `p-8` for hero panels. Don't override radius, border, shadow, or backdrop.

#### Named Rules

**The Glass-As-Region-Not-Card Rule.** In the product app register, `<GlassPanel>` represents one sidebar, note, filter, or grouped-control region per layout, not a wrapper around generic content. Banned product uses: nesting glass inside glass, using glass as a card grid item (the lazy "card slop in glass" pattern), wrapping a whole page in one big glass div with internal columns, applying glass to list rows or summary tiles. Permitted product uses: a single right-rail quick-links and snapshot panel (Overview), a single sidebar filter region (Dashboard), a settings panel grouped by `Section`, dialog/popover overlays. When in doubt, prefer flat regions with hairline `border-border/60` dividers. Marketing home uses Paper Register materials. `/links` uses flat semantic anchors.

### Section Rhythm

Applies to product app glass panels (Project detail right rail, settings panels) and product app flat regions (Overview's projects list, Dashboard's grid). Marketing home and `/links` may use their own restrained heading rhythms.

- **Pattern:** `space-y-6` parent containing `<Section label="…">` children. First section uses `isFirst`; every subsequent section gets a `border-border/60 border-t pt-6` divider above its label.
- **Section heading:** Follow the **Section-Heading-Style Rule** above (lowercase semibold + 2px primary dash). The earlier uppercase-tracking eyebrow style is banned; see **Don'ts**.
- **Region marker discipline:** Per the **Region-Marker-Not-Eyebrow Rule**, the dash + heading marks one region per layout. Don't repeat it on subsections nested inside the region.
- **Loose top group:** When a panel's first group is the implicit topic of the panel, omit the section heading entirely; field labels speak for themselves.

### Chips & Status Indicators

- **Shape:** `rounded-lg` (12px); softer than buttons but not full pill.
- **Style:** `bg-muted` with `text-foreground`, padding `px-2.5 py-1`, height ~24px. No border at rest.
- **Status variants:** Each project status (Wishlist, Purchased, In Stash, In Progress, Completed, Archived, Destashed) has its own hue tint, but **always** carries an icon and a text label alongside the hue. Never hue-only.
- **Mystery chip:** Small primary-tinted chip (`✦ Mystery`) in the top-left badge slot of book covers in the coloring vertical. The chip indicates "this book has hidden page reveals," not "this cover is hidden."

### Inputs / Fields

- **Style:** Default shadcn `Input` with `border border-input`, `bg-card-foreground`, `rounded-md` (10px), height 36px, padding `px-3 py-2`. They pick up the glass context from the wrapping panel automatically.
- **Focus:** 3px primary-tinted ring (`focus-visible:ring-ring/50`) plus border shift to `--ring`. Never disable the ring.
- **Mobile:** Font size forced to 16px to prevent iOS Safari zoom-on-focus.
- **Date:** Native `<input type="date">`, `text-align: left` to defeat iOS Safari's centering of populated dates. No custom date picker.
- **Number:** Use the `useNumberInput` hook so empty state is `""`, not `0`.

### Navigation

- **Bottom nav (phone, ≤640px / `useIsPhone`):** 5-slot fixed bar with the creation "+" CTA centered in slot 3. Active slot uses `bg-primary/10 text-primary`; the creation slot subtly accents at rest with `bg-primary/10` so it reads as the primary action without overpowering. Respects safe-area-inset-bottom via the shared `--bottom-nav-*` CSS variables. 44px touch targets.
- **Top nav / `<SiteHeader>`:** Logo left, action cluster right. Differs by auth state (signed-in shows account/avatar; signed-out shows Login + Sign up); marketing pages otherwise share the same body as authenticated pages.
- **Page header:** Per the **Page-Chrome-Quiet Rule**, the sticky top bar uses `variant="ghost" size="sm"` for Back, Edit, and the overflow trigger so the handwritten Caveat H1 reads first. Optional subtitle below the H1, optional kebab `DropdownMenu` for low-frequency actions in the same ghost shape.

### Segmented Control: `<SegmentedControl variant="glass">`

A glass-track container with a primary-tinted "lozenge" floating over the active segment. Used inside panels for binary or three-way mutually-exclusive choices (e.g. Grid / List / Table view-mode). When the control sits on a flat (non-glass) background, use `variant="solid"` instead.

### Randomizer Wheel: `<RandomizerWheel>`

The randomizer wheel is the only deliberately full-palette product surface. Its colors identify wheel segments, not brand chrome. Preserve the accessibility system around it: patterned overlays, outlined labels, a list/key fallback, screen-reader target lists, reduced-motion behavior, and a text result panel after spin. A literal product preview asset may show the wheel palette, including on the public home page or in `docs/design-previews`, but those colors must not become generic decoration for cards, badges, marketing backgrounds, public utility surfaces, or ordinary status states.

### Image Surfaces: `<ProjectImageDropzone>` template

- 4:3 aspect ratio (`aspect-[4/3]`) by default.
- Empty state: `<label htmlFor>` wrapping the upload UI for keyboard accessibility.
- Filled state: `object-cover` image with floating glass icon-buttons (Replace, Crop, Remove) in the top-right corner over a `bg-gradient-to-b from-black/35 via-black/10 to-transparent` scrim for contrast.
- Drag-and-drop via the `DataTransfer` shim pattern in `ProjectImageDropzone.tsx`.

### Sticky Footer: `<ProjectFormFooter>`

The template for pages with a primary action at the bottom (forms, multi-step flows). Renders a sticky bar with `border-t backdrop-blur` chrome, respects iOS safe-area-inset, and stays clear of the mobile bottom nav. Reuse for any sticky toolbar (bulk-action bar, multi-step wizard); copy the outer markup, swap contents.

## 6. Do's and Don'ts

### Do:

- **Do** choose the surface register first: product app, marketing paper, or public utility.
- **Do** use `<GlassPanel>` as the canonical grouped-region container for new product app surfaces; never `<Card>` / `SectionCard` / `bg-card rounded-lg shadow-sm border` for grouped product regions.
- **Do** keep product app page wrappers at `container mx-auto px-4 py-6`. No arbitrary `max-w-6xl` in product page chrome.
- **Do** use the handwritten Caveat H1 (`font-handwritten text-3xl leading-tight tracking-tight md:text-4xl`) on product page headers, except project create/edit forms where a small Caveat `Adding`/`Editing` label sits above a Karla H1.
- **Do** keep home paper effects inside `src/components/marketing/**`, `src/styles/scrapbook.css`, and marketing preview assets explicitly referenced by the home page.
- **Do** keep `/links` flat, Karla-led, using the selected site theme, and free of glass, paper, and gradients.
- **Do** apply `Section` rhythm with hairline `border-border/60 border-t pt-6` dividers inside panels with multiple labeled groups.
- **Do** use `variant="glass"` for buttons that live inside or near a glass panel; `variant="default"` only for the single high-emphasis primary action.
- **Do** force 44px minimum touch targets on phone surfaces (already enforced for buttons via media query; apply manually to custom interactive elements).
- **Do** convey status by hue plus icon plus label, not hue alone. Color-blindness, `prefers-contrast: more`, and screen readers all need the redundancy.
- **Do** respect `prefers-reduced-motion: reduce`. The CSS already disables `animate-spin-custom`, `animate-float`, and `animate-glow-pulse` under reduced motion; mirror that pattern when adding new animations.
- **Do** show a real focus ring (`focus-visible:ring-[3px] ring-ring/50`) on every interactive element. Never `outline: none` without a visible replacement.
- **Do** reach for `useIsPhone` (640px) for tight-viewport-specific decisions; reserve `useIsMobile` (1024px) for tablet-and-below logic.
- **Do** keep bottom-sheet drawers at 70dvh, not 85dvh, so users see the result list updating underneath.

### Don't:

- **Don't** use literal craft-store aesthetic in the product app: avoid scrapbook fonts, bows, glitter graphics, chalkboard, faux-leather, and Cricut-craft-of-the-week energy outside the home marketing register.
- **Don't** ship a generic SaaS dashboard: no hero KPI tiles ("12 projects in progress / +3 this week / +25%"), no gradient-accented metric cards, no "engagement" framing.
- **Don't** ship AI-slop tells: no `background-clip: text` gradient hero text, no identical card grids of icon + heading + paragraph, no drive-by glassmorphism (glass is a means to an iOS/macOS feel), no side-stripe colored borders (`border-left` greater than 1px as a colored accent on cards or alerts).
- **Don't** stack glass panels inside glass panels. One panel per page region. If a proposal has 3+ panels stacked, collapse to one panel with `Section` rhythm.
- **Don't** use the eyebrow heading style in the product app: uppercase + `tracking-[0.1em]` (or wider) + `text-[11px]`/`text-xs` + `font-bold` is the SaaS-template tell. Use the **Section-Heading-Style Rule** (lowercase semibold + 2px primary dash) instead for product form section labels, ProjectDetail subheadings, and sidebar group titles.
- **Don't** use `variant="glass"` on low-priority footer actions inside flat content regions. Per the **Footer-Action-As-Text-Link Rule**, "Show more", "Manage all your X", inline Save/Cancel, and "Clear all" render as underlined text links. Glass buttons read as a primary affordance and overweight the footer.
- **Don't** use `variant="glass"` (or `variant="outline"`) for the Back, Edit, or overflow buttons in a page's sticky top bar. Per the **Page-Chrome-Quiet Rule**, top-bar chrome is `variant="ghost"` so the handwritten H1 stays the visual anchor. Glass-pill backs are the most common offender and were the canonical pre-cleanup pattern; they're banned in new work.
- **Don't** glassify everything. Content/list pages (Dashboard project grid, Tag list, Notes feed) put content directly on the page with hairline dividers; reserve panels for configuration surfaces and grouped-control surfaces.
- **Don't** use `bg-white/*`, `border-white/*`, `shadow-white/*`, or `rgba(255, 255, 255, …)` for glass surfaces or highlights. Use `--glass-bg`, `--glass-border`, `--glass-highlight`. Alpha-white drifts across themes and breaks dark-mode contrast.
- **Don't** apply Caveat to product H2 or below. Product pages get one handwritten moment, on the H1 or as a deliberate signature number, but not both. The only app-chrome exception is the project create/edit state label above a Karla H1. Home marketing uses the documented Paper Register exception; `/links` uses Karla.
- **Don't** use the legacy aurora tokens. `aurora-purple`, `aurora-pink`, `aurora-blue`, `aurora-teal` are deprecated holdovers from the retired body atmosphere; do not paint them onto chrome, do not revive them as gradients. If a UI element needs primary tint, use `--primary` or `--accent`.
- **Don't** use the long dash character in UI copy, code, or commits. It's an AI-slop tell. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** introduce a FAB for primary mobile actions. Extend `<BottomNavigation>` with a centered creation slot instead; no z-index conflicts with drawers, consistent across pages.
- **Don't** introduce product app or `/links` gradients on chrome or state. The only product-body gradient is `--page-atmosphere` on `.page-atmosphere`. No `linear-gradient`, `radial-gradient`, or `conic-gradient` on product buttons, panels, headers, badges, dividers, hover states, or section backgrounds. Other exceptions stay documented: image scrim for icon-button contrast, `progressive-placeholder` shimmer, paper/washi texture gradients in `src/styles/scrapbook.css`, and non-shipped `docs/design-previews` artifacts.
- **Don't** glassify auth pages (Login, Register, password reset). They're auth chrome with a different design language and should keep their existing layout.
- **Don't** introduce public profiles, leaderboards, or "trending in your network" surfaces. Per-user data isolation is a felt feature, not just a backend property.
- **Don't** rely on a single hue to communicate status. If a screenshot in greyscale is ambiguous, the design has failed.

Coloring page Color Codes & Swatches uses the existing control panel below
Mediums, with the usual section heading and divider. Thumbnails and plain-text
notes remain flat within that region. No additional panel or navigation is added.

## Destructive colors in Dark mode

Filled destructive controls use `bg-destructive` with
`text-destructive-foreground`: deeper red (HSL 0 65% 48%, approximately
`#ca2b2b`) and pale text (`#f7f2f7`). Error messages, destructive text actions,
and danger icons use `text-destructive-text`: lighter red (HSL 0 80% 72%,
approximately `#f17e7e`). Do not use the fill token for standalone danger text.
Light mode retains its existing red for both roles.

The Dark solid button pair measures 4.90:1, and the lighter danger text
measures 6.05:1 against the card surface. Shared destructive buttons use the
foreground token; glass destructive buttons use an opaque fill in both themes.
The Light solid button pair measures 5.40:1 against its white label.
