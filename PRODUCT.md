# Product

## Register

product

## Users

People who do diamond painting, coloring books, or both, and have more projects than time. They know the difference between a kit in their stash and one they've paid for that hasn't shipped yet. They take progress photos so they can see how a project changes over time.

Most visits are quick: log some progress, look through the stash, or use the randomizer to pick what to work on next. That's usually on a phone, often one-handed mid-project. Desktop is for bigger jobs like importing a haul, tagging, or cleaning up artist, company, publisher, and illustrator records.

## Product Purpose

Organized Glitter keeps track of craft projects. Diamond paintings and coloring books share the same statuses:

Wishlist → Purchased → In Stash → In Progress → Completed → Archived → Destashed

Coloring books show `in_stash` as "In library."

Diamond paintings also store kit details and progress notes. Coloring books also store pages, page photos, mediums, and mystery reveals.

People should be able to see what they own, log progress on what they're working on, and stop digging through their camera roll to figure out where things stand. If they open it most days and log progress, it's doing its job.

## Brand Personality

Friendly and organized, like a friend who also crafts and is a little more on top of things than you are. Not salesy or cutesy.

For polish, I look at the Linear app. For warmth, Pagebound.

The "Glitter" in the name is a joke. Don't put glitter on anything.

## What to Avoid

In the signed-in app:

- Craft store decor: bows, glitter graphics, script fonts, chalkboard textures
- Dashboard stats like "12 in progress, +3 this week" and gradient metric cards
- Gradient text (`background-clip: text` on a gradient is banned)
- Grids of identical cards with an icon, heading, and paragraph
- Glass as decoration (it's there to feel like iOS and macOS)
- Colored stripes down the side of cards or alerts
- Endless masonry layouts
- Fake notebooks, leather textures, or sidebars full of widgets

## Public Pages

The public home page can use paper, washi tape, scrapbook layouts, Caveat accents, and texture gradients. The signed-in app stays plain.

`/links` is my brand page, not a user profile feature.

## Design Principles

1. **Shared statuses.** Diamond paintings and coloring books work the same way. Craft-specific details like drill shape, page status, mediums, and mystery reveals get added to the shared model instead of becoming their own separate thing.
2. **Track what actually happens.** Destashed and Archived are there on purpose. Purchased-but-not-arrived is its own status. Progress logs keep photos and dates.
3. **Plain and polished.** Apple Notes and iOS Settings are better references than any craft brand. Glass and translucency separate sections. If a screen looks fine flat, leave it flat.
4. **Private.** No public profiles, leaderboards, or social features. Each person's data is kept separate.
5. **Content first.** Put content directly on the page. No cards inside cards, no tabs hiding the main content, and no marketing on app screens. Use flat lists with thin dividers. Use panels only for settings and grouped controls.
6. **Fewer words.** No taglines, helper text, or secondary labels. If a screen needs them to make sense, change the layout. Keep input labels, error messages, status text, accessible names, and the next step in empty states.

## Free App and Website Support

Everything in the app is free, including tracking, manual entry, and import and export. That won't change when the diamond catalog arrives. Catalog search, scanning, imports, and contributions will all be free too. The catalog will start with curated kit details and accept submissions after review. Private projects stay separate from it.

Tips are website-only and don't unlock anything. The native app has no payments, tip prompts, or checkout links. The `/support` page on the website takes one-time tips of $2, $3, $5, $10, or a custom amount through Stripe Payment Links. No subscriptions and no pop-ups.

See [ADR-0022](./docs/adr/0022-free-catalog-and-optional-tips.md).

## Accessibility & Inclusion

- **WCAG 2.2 AA minimum** across all shipped product surfaces; aim higher on text contrast where the design allows.
- **Touch targets**: 44px minimum on phone surfaces (already enforced for glass; applies everywhere). Bottom-nav slots, status chips, list-row tap zones, and primary actions all clear this floor without exception.
- **Low-vision support** is a first-class concern: real visible focus rings (no `outline: none` without a replacement), text sized for legibility on a phone held at arm's length, contrast ratios verified against the dark/light theme tokens, and no information conveyed by color alone (status is hue + label + icon, never hue alone).
- **Reduced motion** is respected. `prefers-reduced-motion: reduce` disables non-essential transitions and replaces motion-based affordances with static equivalents. Motion is never the only signal that something has changed.
- **Reduced contrast / high contrast** preferences are respected where the design system allows; tokens should degrade gracefully under `prefers-contrast: more`.
- **Keyboard navigation** is required on every interactive surface. Status cards, list rows, filter controls, and modal dismissals all work without a pointer, with visible focus and predictable tab order.
- **Screen readers**: interactive status cards have `aria-label` and `aria-pressed`; buttons declare `type="button"` unless they are intentionally submit/reset; lists and grids announce position and total count where relevant.
