# ADR-0020: Build the native SwiftUI app in a separate repository

Date: 2026-07-27

## Status

Accepted. Supersedes ADR-0002's Expo workspace decision and ADR-0011's
native-undecided status. The PWA remains supported.

## Context

Organized Glitter needs a native iPhone and iPad application for existing
users. The earlier mobile preparation assumed an Expo workspace in this
repository, while the later PWA-first decision deliberately left native work
undecided.

The chosen application is now a universal SwiftUI client. It shares PocketBase
contracts with the web application but shares no source code, package manager,
build tooling, signing, or release process. Backend deployments and App Store
releases also cannot be atomic in practice.

The maintenance budget is addressed by keeping the native client narrow:
Apple platform APIs first, online-only writes, no realtime requirement, no
offline queue, and no generic cross-platform abstraction.

## Decision

Build the native app in the private repository:

```text
Interactive-Buffoonery/organized-glitter-app
```

This repository remains canonical for:

- The React web application.
- PocketBase schema, migrations, hooks, routes, and authorization rules.
- Backend contracts, seed data, tests, backups, and recovery procedures.

The native repository owns:

- The universal SwiftUI application for iOS and iPadOS 18 or newer.
- Native navigation, design, accessibility, tests, signing, and distribution.
- A concrete URLSession PocketBase client and Keychain session storage.
- A backend contract pin containing the backend commit, PocketBase version,
  and committed schema hash used by native integration tests.

No source package, Git submodule, TypeScript copy, or PocketBase hook is shared
between the repositories. Backend changes land first and remain compatible
with the web app and previously released native builds.

PocketBase remains the v1 backend. A Convex migration requires a separate ADR
and a demonstrated PocketBase blocker.

## Rejected alternatives

### Expo in `apps/mobile`

Expo would keep the apps in one repository, but it adds a second JavaScript
runtime and React Native dependency surface without source reuse. The selected
SwiftUI client is smaller and aligns directly with the Apple release target.

### Native SwiftUI inside this repository

This would retain atomic source commits but mix Xcode signing and App Store CI
with the Node and PocketBase workspace. Runtime rollout would still be
independent, so the repository would not provide atomic deployment.

### Move to Convex before native work

This adds user-data and identity migration risk before the existing backend has
demonstrated a launch-blocking limitation.

## Consequences

- `apps/mobile` is retired as an implementation destination. The reservation
  directory was later removed; native work lives only in
  `Interactive-Buffoonery/organized-glitter-app`.
- Existing mobile product and backend contracts remain useful after removing
  Expo-specific instructions.
- Cross-repository changes use paired Linear dependencies and independently
  releasable pull requests.
- The native release is blocked until production authentication,
  authorization, file privacy, backup, and recovery evidence passes.
- This repository remains the only place where PocketBase schema and server
  behavior may change.
