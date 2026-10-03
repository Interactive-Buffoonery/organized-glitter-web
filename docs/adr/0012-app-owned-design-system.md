# ADR-0012: Build an app-owned design system on Tailwind and Radix

Date: 2026-06-12 (records a system that evolved through 2025-2026, including
the glass redesign; written down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

The app needs a consistent, accessible, mobile-first visual system maintainable
by one person. Off-the-shelf component kits drift toward generic "card slop";
the product wants an iOS/macOS-adjacent feel (the glass system) with its own
typography and color voice.

## Decision

The design system is app-owned:

- **Tailwind CSS 4** with semantic color tokens defined in `src/index.css`;
  hardcoded gray/white surface classes are not allowed outside documented
  exceptions.
- **Radix primitives wrapped in `src/components/ui/`** (shadcn-style). Product
  code imports the app-owned wrappers, never third-party primitives directly.
- **Glass system:** `GlassPanel` and documented glass tokens for page-level
  surfaces, governed by the one-panel-per-region rule (no cards in cards, no
  glass in glass). Glass is a means to the iOS/macOS feel, not decoration.
- **Self-hosted fonts** via Fontsource (Karla for UI, Caveat for display,
  JetBrains Mono): no Google Fonts links or font CDNs in the app shell.
- **Accessibility as a design rule:** status uses hue plus icon plus label,
  never color alone; 44px minimum touch targets on mobile; interactive cards
  carry ARIA and keyboard support.

`DESIGN.md` and `docs/design-system/` are the living spec; this ADR records
the decision to own the system rather than adopt one.

## Rejected Alternatives

### A full component library (MUI, Mantine, Ant)

Heavy theming fights, larger bundles, and a look that resists the glass
direction. Radix gives behavior and accessibility without imposing visuals.

### Unwrapped shadcn/Radix usage in product code

Direct imports scatter variant logic and make system-wide changes (like the
glass migration) a grep-and-pray exercise. The wrapper layer is the upgrade
seam.

## Consequences

- Visual changes happen in tokens and wrappers and propagate; product code
  stays mostly class-free of raw palette values.
- Every new primitive costs a wrapper, which is accepted overhead.
- The one-panel-per-region rule is reviewable and concrete; "card slop in
  glass" is a rejectable pattern by policy.
- Self-hosted fonts keep the app CDN-independent and CSP-tight (ADR-0008).
