# Coloring Color Keys

A color key is the per-page record of which color the user picked for each
symbol printed on a mystery coloring page. Each row pairs one symbol with a
code, an optional color name and swatch, codes tried first, and a note. This
document is the shared contract for the web app and the native iOS app.

Color keys are separate from Color Codes & Swatches
(`coloring_page_color_references`), which stores photos of full reference
sheets. Both can exist on the same page.

On the web, both are edited on the page's colors screen
(`/coloring/:bookId/pages/:pageId/colors`). The page detail panel shows a
read-only Colors summary: a Track the colors used for this page button when the page has
neither, otherwise thumbnails, codes, progress, Edit colors, and Copy.

## Product rules

- Keys belong to one page. Symbols vary from page to page, so nothing is copied
  between pages and there is no book-level key.
- It is a record, not a matching aid. There is no marker database and no color
  matching. Codes are free text.
- Symbols are picked from a built-in catalog. A symbol missing from the catalog
  can be sent in as a photo (a symbol request), which works as a placeholder
  until it is resolved.
- Rows keep strip order through `position`. The symbol, not the position, is
  what the user looks for on the page.

## Symbol IDs

Every stored symbol is a string ID in one of three forms:

| Form                 | Example             | Meaning                                                                     |
| -------------------- | ------------------- | --------------------------------------------------------------------------- |
| `u:<HEX>[-<HEX>...]` | `u:03C8`            | Unicode text. Uppercase hex code points, 4 to 6 digits each, joined by `-`. |
| `c:<slug>`           | `c:linked-circles`  | Custom shape drawn by the app. Slug is lowercase `a-z0-9-`, up to 48 chars. |
| `r:<id>`             | `r:abc123def456ghi` | Placeholder for a symbol request (15-char PocketBase record ID).            |

Validation pattern:
`^(u:(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4})(-(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4}))*|c:[a-z0-9-]{1,48}|r:[a-z0-9]{15})$`

Each `u:` code point is a Unicode scalar value written in its shortest
uppercase form with at least 4 digits, so every symbol has exactly one ID. The
pattern must match the entire string; in Swift or ICU use `\A...\z` or a
whole-string match, because `$` can match before a trailing line break.

Rendering rules for clients:

- `u:` renders the decoded code points as text, whether or not the ID is in the
  client's catalog. When rendering, append U+FE0E (text presentation) after
  every non-ASCII emoji-capable code point that is not already followed by a
  variation selector, so symbols such as ♥ and ✔ never show as color emoji.
  IDs never contain U+FE0E or U+FE0F; strip them when building an ID, and keep
  them out of Copy text.
- `c:` renders the catalog's vector path. An unknown `c:` slug renders a neutral
  placeholder box with an accessible label of "Unknown symbol".
- `r:` renders the request's photo thumbnail (`96x96f`). If the request is not
  readable, render the neutral placeholder.

## Symbol catalog

Source of truth: `src/features/coloring/colorKeys/symbolCatalog.json`. The iOS
app vendors a copy. Shape:

```json
{
  "version": 1,
  "groups": [{ "id": "greek", "label": "Greek" }],
  "symbols": [
    {
      "id": "u:03C8",
      "char": "ψ",
      "name": "Psi",
      "group": "greek",
      "keywords": ["psi", "trident", "fork"]
    },
    {
      "id": "c:linked-circles",
      "name": "Linked circles",
      "group": "shapes",
      "keywords": ["circles", "rings", "infinity"],
      "path": "M4 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M10 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"
    }
  ]
}
```

- Group IDs, in display order: `numbers`, `lowercase`, `uppercase`, `greek`,
  `money`, `math`, `music`, `signs`, `letters-extra`, `shapes`.
- `char` is present only for `u:` symbols and must equal the decoded ID.
- `path` is present only for `c:` symbols: SVG path data on a 24x24 grid, drawn
  as a 2pt stroke with round caps and joins and no fill. Paths use only the
  commands `M L H V C Q A Z` (absolute or relative) so native clients can parse
  them.
- `keywords` hold lowercase search terms, including lookalike descriptions
  ("trident", "yen", "triangle").
- IDs are never renamed or removed once shipped. `version` increases whenever
  symbols are added.

## Collections

### `coloring_page_color_keys`

| Field                | Type                                                | Notes                                                                |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `user`               | relation `users`, required, cascade delete          | Owner.                                                               |
| `page`               | relation `coloring_pages`, required, cascade delete | Must belong to a book the user owns.                                 |
| `position`           | number, required, integer, min 0                    | Strip order. Not unique; clients sort by `position`, then `created`. |
| `symbol`             | text, required, max 64                              | Symbol ID matching the pattern above.                                |
| `code`               | text, max 100                                       | Free text, for example `654`, `PU306`, `Posca noir`.                 |
| `color_name`         | text, max 100                                       | Optional.                                                            |
| `swatch`             | text                                                | Empty or `#RRGGBB`.                                                  |
| `tried`              | json                                                | Array of up to 20 strings, each up to 100 chars. Codes tried first.  |
| `note`               | text, max 2000                                      | Optional.                                                            |
| `created`, `updated` | autodate                                            |                                                                      |

Indexes on `page` and `(user, symbol)`. API rules mirror `coloring_pages`: the caller must be verified,
own the record (`user`), and own the page's book. `user` and `page` cannot be
changed after create. A server hook validates `tried` and `swatch`; omitted
`tried`, null, and empty values default to `[]` on all saves, including internal
saves. Position presence is enforced by the API create hook rather than PocketBase's numeric `required` flag, which rejects zero.
Update payloads may include unchanged `user` and `page` values. Only actual
changes are rejected, using PocketBase's `:changed` rule modifier.

When a key is created or updated with an `r:` ID for the same user's already
`added` or `matched` request, the hook stores that request's resolved symbol
instead. Unknown, unresolved, and other users' request IDs remain placeholders.
Known limit: syntactically valid `r:` IDs do not require an existing or owned
request.

Known concurrency limit: a key saved concurrently with a resolution may keep
`r:<id>` until either the key or the request is saved again.

### `coloring_symbol_requests`

| Field                | Type                                                                                    | Notes                                                     |
| -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `user`               | relation `users`, required, cascade delete                                              | Requester.                                                |
| `page`               | relation `coloring_pages`, optional                                                     | Page it came from, if any. Must be owned by the user.     |
| `book_label`         | text, required, max 200                                                                 | Book and page as the user describes it.                   |
| `description`        | text, max 500                                                                           | Optional, for example "Two w's stacked".                  |
| `email`              | email, required                                                                         | Contact address, prefilled from the account and editable. |
| `photo`              | file, required, 1 file, 10 MB, jpeg/png/webp, protected, thumbs `96x96f` and `320x320f` | Cropped or uncropped photo.                               |
| `status`             | select `open`, `added`, `matched`, `declined`                                           | Set to `open` on create by the server.                    |
| `resolved_symbol`    | text, max 64                                                                            | `u:` or `c:` ID chosen when resolved.                     |
| `created`, `updated` | autodate                                                                                |                                                           |

- Users can create and read their own requests. Only superusers update or
  delete them. Clients cannot set `status` or `resolved_symbol`.
- Creating a request is limited to five attempts per user per 15 minutes
  (in-memory, reset on restart; superuser creates bypass the quota) and emails the maintainer
  through the same `FEEDBACK_TO_EMAIL` inbox as in-app feedback
  (`contact@organizedglitter.app` in production). No separate recipient setting
  is used. The maintainer message includes the account ID, account email, and
  separately labeled typed contact email. Book labels and descriptions have
  line breaks replaced with spaces and appear last. A mail failure does not
  fail the request. Missing configuration skips mail
  and logs the reason. Notifications run after commit without a retry queue.
- When a superuser sets `status` to `added` or `matched` with a
  `resolved_symbol`, the server replaces `r:<request id>` with that symbol on
  every one of the requester's color keys, then emails the requester. Clients
  pick up the change on their next fetch.
- Every nonempty `resolved_symbol` must be a canonical Unicode or custom ID,
  including while open or declined. It can be changed or cleared until the
  previous status is `added` or `matched`, when it becomes immutable and the
  status can only move between `added` and `matched`. A superuser attempt
  returns 400. Only matching `r:<request id>` rows are
  rewritten, so previously resolved choices are not silently reassigned.
- Resolution and key replacements commit atomically. A failed key save rolls
  back the transaction and returns an error containing the key ID. Resolution
  mail goes to the typed contact address only when at least one key was
  rewritten or the status entered `added` or `matched` from an unresolved
  state. Repeat saves and changes between `added` and `matched` with the same
  symbol send nothing unless keys were actually rewritten. Declining leaves
  keys unchanged.
- Adding a brand new custom shape also needs a catalog update in both apps.
  New Unicode symbols render everywhere immediately.

## Client behavior

- **Setup.** A page with no keys offers a starting list: `1`-`9`, `0`, then
  `a`-`z`. All 26 letters start on, and the user turns off letters missing from
  the strip. Symbols after `z` are added from the picker. Setup can be skipped.
  Clients save setup with one call, `POST /api/coloring/color-keys/setup` with
  `{ "page": "<page id>", "symbols": ["u:0031", ...] }`. It takes 1 to 100
  different valid symbol IDs and creates rows at positions `0` to `n-1` in one
  transaction, returning `{ "items": [...] }`. It requires a verified owner of
  the page's book. If the caller already has any key on the page, it creates
  nothing and returns HTTP 409 ("This page already has symbols."), so a retry or
  a second device never duplicates rows. After any error, reload the page's keys
  and show what the server has.
- **Picker.** Search by name or keyword, a recently used row, catalog groups,
  then "Can't find your symbol? Send us a photo and we'll add it."
- **Entry.** Opens in place of the row on the web, with focus in Code. Cancel or
  Escape closes it and returns focus to the row. Opening another row or adding a
  symbol saves changes first; if that save fails, the entry stays open with the
  error. Shows the symbol large with its
  name. Code autocompletes from the
  user's own earlier keys; picking one fills the color name and swatch last used
  with that code. Fields: code, color name, swatch, tried first, note. "Save and
  next" moves to the next position.
- **Symbol request.** Photo (crop optional), book and page (prefilled), optional
  description, required email (prefilled from the account), and "Use my photo as
  the symbol on this page for now" (on by default), which adds or updates a key
  row with `r:<request id>`.
- **Copy.** Plain text in position order, one entry per row:
  `<symbol> <code>`, where custom shapes use their catalog name and requests use
  their description or "Sent symbol".

## Archives

Archives include color keys with their pages; symbol requests are not included.
Request placeholder IDs survive restore, subject to the normal same-user late
resolution hook. See [Import and export](./import-export.md#color-key-archive-extension).

## Compatibility

Both collections are additive. Released native builds ignore them. The iOS app
pins its backend revision and updates `ios/BackendContract.json` only after
this backend change is verified.
