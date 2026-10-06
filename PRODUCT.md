# Product

## Register

product

## Users

Multi-craft hobbyists who own a non-trivial number of in-progress and unstarted projects across one or more crafts (diamond painting and coloring books today; cross-stitch, paint-by-number, and similar verticals plausible later). They are the kind of crafter who has bought more kits and books than they have time to finish, who actually cares about the difference between "in stash" and "purchased but not yet received," and who logs progress photos as both motivation and memory. Sessions are short and frequent: opening the app to log progress on a current project or page, browse what's in the stash, or ask the randomizer what to work on next. Often used on a phone, one-handed, between rows of stitching or pages of coloring. Sometimes used on desktop for batch organization (importing a haul, tagging, cleaning up artist/company/publisher/illustrator records).

## Product Purpose

Organized Glitter is a multi-craft project tracker built around a shared project/book ownership spine (Wishlist → Purchased → In Stash → In Progress → Completed → Archived → Destashed) with vertical-specific progress details layered on top. Diamond paintings track kit metadata and progress notes; coloring books track book ownership, generated page records, page photos, mediums, and mystery reveals. Its purpose is to let a crafter see all of their projects, log progress against the ones they're working on, and tell the truth about what they own without scrolling through a thousand camera-roll photos. Success looks like a user opening the app daily, logging real progress against real projects or pages, and feeling more in control of their stash, not less.

## Brand Personality

Warm, organized, considered. The voice is a friend who is genuinely interested in your craft and slightly more organized than you are, never a SaaS announcer and never a craft-store mascot. Linear's polish, Goodreads' warmth, Notion's flexibility, and none of the three's failure modes. The interface should feel like the app respects the user's time, the user's projects, and the user's eyes; it should not feel like the app is trying to sell, gamify, or congratulate. Quiet competence over decoration. The "Glitter" in the name is a wink, not a visual instruction.

## Anti-references

- **Literal craft-store aesthetic in the product app.** Authenticated product surfaces do not use bows, glitter graphics, scrapbook-style script fonts, chalkboard textures, or Cricut-project-of-the-week energy. The product is for organized hobbyists, not for visiting a Michaels. The public home page has its own marketing paper register; do not import that language into the app shell, dashboards, project pages, forms, or settings.
- **Generic SaaS dashboard.** No hero KPI tiles ("12 projects in progress / +3 this week / +25%"), no gradient-accented metric cards, no "engagement" framing. This is a personal library, not a B2B funnel.
- **AI slop tells.** No gradient hero text (`background-clip: text` on a gradient is banned), no identical card grids of icon + heading + paragraph, no drive-by glassmorphism (glass is a means to an iOS/macOS feel, never decoration), no side-stripe colored borders on cards or alerts.
- **Pinterest-style endless masonry.** Project covers vary in shape and aspect, but the page is a deliberate library, not an infinite mood board.
- **Forum-era craft software.** No skeuomorphic notebooks, no faux-leather binding, no sidebar full of widget panels.

## Public Surface Notes

- The public home page may use paper, washi, scrapbook layout language, Caveat accents, and material texture gradients as a scoped marketing register.
- The authenticated app remains quiet, private, and non-decorative even when public marketing uses warmer materials.
- `/links` is Sarah/brand public utility chrome, not a user-profile feature. It does not weaken the product rule against public profiles, social comparison, leaderboards, or "trending in your network" surfaces.

## Design Principles

1. **Multi-craft, single spine.** Diamond painting projects and coloring books share the same ownership/status mental model; future crafts plug into the same shape. Vertical-specific affordances (drill shape, coloring page status, mediums, mystery-page reveals) live as polite extensions of the shared model, never as parallel apps stitched together.
2. **Built by a crafter who actually finishes things.** Status hygiene is a feature: Destashed and Archived exist on purpose, progress logging takes photos and dates seriously, and the stash math reflects real life (purchased-but-not-arrived is its own state). The product earns its name by being legitimately organized, not by saying it is.
3. **Quietly polished, not cute.** Restraint over decoration. iOS Settings and Apple Notes are closer references than any craft brand. Glass and translucency are tools for section rhythm and surface hierarchy, never ornament. If a surface reads as iOS-y while flat, leaving it flat is correct.
4. **Your library, your eyes only.** Privacy is a product principle and should be felt, not just true. No public profiles by default, no "trending in your network," no leaderboards or social comparison surfaces. Per-user data isolation is part of the experience: the app feels like a private library because it is one.
5. **The list page is the page.** Content lives directly on the surface and chrome serves it. No content-in-card-in-card nesting, no tabs that hide what the user came to see, no marketing chrome on app pages. Default to flat content with hairline dividers; reserve panels for configuration and grouped controls.

## Free app and website support

All app features are free, including tracking, manual entry, import/export,
and planned diamond-catalog search, scanning, imports, and contributions.
Start with curated kit metadata, then accept voluntary submissions after
review. Private projects remain separate from published catalog facts.

Voluntary support is website-only and grants no app features, content, or
account privileges. The native app contains no payment processing,
contribution prompts, or checkout links.

[ADR-0022](./docs/adr/0022-free-catalog-and-optional-tips.md) records the direction.

## Accessibility & Inclusion

- **WCAG 2.2 AA minimum** across all shipped product surfaces; aim higher on text contrast where the design allows.
- **Touch targets**: 44px minimum on phone surfaces (already enforced for glass; applies everywhere). Bottom-nav slots, status chips, list-row tap zones, and primary actions all clear this floor without exception.
- **Low-vision support** is a first-class concern: real visible focus rings (no `outline: none` without a replacement), text sized for legibility on a phone held at arm's length, contrast ratios verified against the dark/light theme tokens, and no information conveyed by color alone (status is hue + label + icon, never hue alone).
- **Reduced motion** is respected. `prefers-reduced-motion: reduce` disables non-essential transitions and replaces motion-based affordances with static equivalents. Motion is never the only signal that something has changed.
- **Reduced contrast / high contrast** preferences are respected where the design system allows; tokens should degrade gracefully under `prefers-contrast: more`.
- **Keyboard navigation** is required on every interactive surface. Status cards, list rows, filter controls, and modal dismissals all work without a pointer, with visible focus and predictable tab order.
- **Screen readers**: interactive status cards have `aria-label` and `aria-pressed`; buttons declare `type="button"` unless they are intentionally submit/reset; lists and grids announce position and total count where relevant.
