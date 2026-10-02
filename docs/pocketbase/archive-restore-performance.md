# Archive restore taxonomy reads

The v3 restore endpoint accepts up to 1,000 tag names per item. It deduplicates
names before restoring owned taxonomy and deterministic joins inside the item
transaction. It reads normalized tag matches and join IDs in batches of 250.
New tags and joins still go through PocketBase record validation and saves.

Tag lookup retains SQLite's ASCII `LOWER(TRIM(name))` semantics. Request name
deduplication retains JavaScript lowercase semantics. A `Map` holds matches so
names such as `constructor` and `__proto__` remain valid. When existing owned
names have the same normalized value, the endpoint uses its original `LIMIT 1`
lookup to preserve the selected existing record. It does not choose a new winner.
No index, schema, ownership rule, archive limit, receipt or ID format changed.

## Measurement

A disposable PocketBase 0.40.4 fixture on September 30, 2026 measured the actual
restore route at base `47209ae4be025aa59b5e8a03b940f004f5827b0f`. Synthetic
owned taxonomy contained 100, 1,000 or 10,000 tags. Each scenario used one warmup
and five measured restores. New-tag scenarios accumulated new tags across those
six calls. Read and second restore requests started 5 ms after the large restore.
The timings include local HTTP and database work, without uploaded photos.

Median milliseconds for 1,000 distinct new names:

| Initial owned taxonomy | Before restore | Batched restore | Before second write | Batched second write |
| ---------------------- | -------------: | --------------: | ------------------: | -------------------: |
| 100                    |          1,121 |             250 |               1,116 |                  244 |
| 1,000                  |          1,318 |             247 |               1,312 |                  241 |
| 10,000                 |          3,234 |             262 |               3,229 |                  260 |

Concurrent reads stayed near 2 to 3 ms. This demonstrated writer contention,
not a general request stall. These are local synthetic measurements with the
archive endpoint and Apple fixture hooks, not production capacity estimates or
full importer timings. Files, network transfer, the full deployed hook set,
host hardware and taxonomy distributions can change absolute latency.

## Regression coverage

Run `pnpm pb:test:archive-restore-v3`. The disposable runner captures SQL in dev
mode and asserts that a 1,000-tag project or book uses four normalized-name
queries rather than 1,000. It also checks joins, replay, deterministic tag IDs,
existing mixed-case matches, non-ASCII names, foreign ownership, prototype-like
names, the 1,001-tag rejection and transaction rollback. Query counts are the
performance regression signal; CI does not assert machine-dependent timings.
