/// <reference path="../pb_data/types.d.ts" />
// ponytail: coloring_book_tags has no timestamps, so it has nothing to backfill.
const CRAFTING_BACKFILL_SOURCES = [
  ['projects', 'src.user', ''],
  ['progress_notes', 'owner.user', 'JOIN projects owner ON owner.id = src.project'],
  ['project_tags', 'owner.user', 'JOIN projects owner ON owner.id = src.project'],
  ['tags', 'src.user', ''],
  ['companies', 'src.user', ''],
  ['artists', 'src.user', ''],
  ['coloring_books', 'src.user', ''],
  ['coloring_pages', 'owner.user', 'JOIN coloring_books owner ON owner.id = src.book'],
  ['coloring_page_progress_notes', 'src.user', ''],
  ['coloring_tags', 'src.user', ''],
  ['coloring_mediums', 'src.user', ''],
  ['book_illustrators', 'src.user', ''],
  ['book_publishers', 'src.user', ''],
  ['coloring_page_color_references', 'src.user', ''],
  ['coloring_page_color_keys', 'src.user', ''],
  ['coloring_symbol_requests', 'src.user', ''],
];

function craftingSlotSql(column) {
  return `substr(${column}, 1, 14) || printf('%02d', (CAST(substr(${column}, 15, 2) AS INTEGER) / 15) * 15) || ':00.000Z'`;
}

migrate(
  app => {
    for (const [table, owner, join] of CRAFTING_BACKFILL_SOURCES) {
      const slots = ['created', 'updated']
        .map(
          column =>
            `SELECT ${owner} AS owner, ${craftingSlotSql(`src.${column}`)} AS slot FROM ${table} src ${join} WHERE src.${column} LIKE '____-__-__ __:__:%'`
        )
        .join(' UNION ');
      app
        .db()
        .newQuery(
          `INSERT OR IGNORE INTO crafting_activity (id, user, slot, created, updated)
           SELECT substr(lower(hex(randomblob(8))), 1, 15), owner, slot,
             strftime('%Y-%m-%d %H:%M:%fZ', 'now'), strftime('%Y-%m-%d %H:%M:%fZ', 'now')
           FROM (${slots})
           WHERE owner IN (SELECT id FROM users)`
        )
        .execute();
    }
  },
  () => {}
);
