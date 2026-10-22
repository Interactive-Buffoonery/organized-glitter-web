/// <reference path="../pb_data/types.d.ts" />

// Legacy projects may reference another account's company or artist. Their
// sort proxies held that account's private name, so blank them and sort them
// with unlinked projects. The down step is a no-op because restoring foreign
// names would reintroduce the disclosure.
migrate(
  app => {
    app
      .db()
      .newQuery(
        `UPDATE projects SET company_name_sort = '', company_sort_order = 1
         WHERE company != ''
           AND NOT EXISTS (
             SELECT 1 FROM companies
             WHERE companies.id = projects.company AND companies.user = projects.user
           )`
      )
      .execute();
    app
      .db()
      .newQuery(
        `UPDATE projects SET artist_name_sort = '', artist_sort_order = 1
         WHERE artist != ''
           AND NOT EXISTS (
             SELECT 1 FROM artists
             WHERE artists.id = projects.artist AND artists.user = projects.user
           )`
      )
      .execute();
  },
  () => {}
);
