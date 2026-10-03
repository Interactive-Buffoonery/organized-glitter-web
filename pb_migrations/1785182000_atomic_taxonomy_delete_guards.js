// @ts-nocheck

const triggerDefinitions = [
  {
    name: 'guard_companies_delete_in_use',
    table: 'companies',
    referenceQuery: 'SELECT 1 FROM projects WHERE company = OLD.id',
  },
  {
    name: 'guard_artists_delete_in_use',
    table: 'artists',
    referenceQuery: 'SELECT 1 FROM projects WHERE artist = OLD.id',
  },
  {
    name: 'guard_tags_delete_in_use',
    table: 'tags',
    referenceQuery: 'SELECT 1 FROM project_tags WHERE tag = OLD.id',
  },
  {
    name: 'guard_book_publishers_delete_in_use',
    table: 'book_publishers',
    referenceQuery: 'SELECT 1 FROM coloring_books WHERE publisher = OLD.id',
  },
  {
    name: 'guard_book_illustrators_delete_in_use',
    table: 'book_illustrators',
    referenceQuery: 'SELECT 1 FROM coloring_books WHERE illustrator = OLD.id',
  },
  {
    name: 'guard_coloring_mediums_delete_in_use',
    table: 'coloring_mediums',
    referenceQuery:
      'SELECT 1 FROM coloring_pages AS page, json_each(page.mediums) AS medium WHERE medium.value = OLD.id',
  },
  {
    name: 'guard_coloring_tags_delete_in_use',
    table: 'coloring_tags',
    referenceQuery: 'SELECT 1 FROM coloring_book_tags WHERE tag = OLD.id',
  },
];

migrate(
  app => {
    triggerDefinitions.forEach(definition => {
      app
        .db()
        .newQuery(
          `CREATE TRIGGER IF NOT EXISTS ${definition.name}
           BEFORE DELETE ON ${definition.table}
           FOR EACH ROW
           WHEN EXISTS (${definition.referenceQuery})
           BEGIN
             SELECT RAISE(ABORT, 'This list item is still in use.');
           END`
        )
        .execute();
    });
  },
  app => {
    [...triggerDefinitions].reverse().forEach(definition => {
      app.db().newQuery(`DROP TRIGGER IF EXISTS ${definition.name}`).execute();
    });
  }
);
