# Shared example library

These local-only fixtures mirror the sample titles, statuses and artwork in
`example@organizedglitter.app` and native app PR #54. The source revision is
`8c0556a54abfab8dab112c38d010e7196fdcaa4e`. Fixture metadata is in `library.json`.
The JPEG files come from that revision's debug-only FixtureAssets catalog.

The six diamond images are credited to Annie Spratt, Dave Hoefler, Aaron Burden,
Borna Bevanda, Hayden Walker and Braden Jarvis under the Unsplash License.
Coloring covers and the eleven first-book page images come from Smithsonian
Libraries and NASA publications. These images retain their original credits and
have separate use terms from the repository license. The original publications,
page mappings and use terms are recorded in
[the source catalog](../../../docs/test-data/example-image-sources.md).

Diamond Art Club product artwork is excluded.
Fixtures contain no hosted record identifiers, users, passwords, auth state or
account exports. Local credentials are generated or supplied separately.

`pnpm pb:bootstrap:local -- --seed-examples` adds the library to the ordinary
local fixtures. `pnpm pb:test:examples` boots a fresh local PocketBase, imports
the current schema and hooks, and verifies images, generated pages, repeat
seeding and ownership protection. The images are test inputs, not web assets.
