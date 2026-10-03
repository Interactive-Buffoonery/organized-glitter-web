/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const duplicates = arrayOf(new DynamicModel({ user: '', total: 0 }));
    app
      .db()
      .newQuery(
        `
          SELECT user, COUNT(*) AS total
          FROM user_dashboard_settings
          GROUP BY user
          HAVING COUNT(*) > 1
          LIMIT 1
        `
      )
      .all(duplicates);

    if (duplicates.length > 0) {
      throw new Error(
        'Cannot add the user_dashboard_settings unique index: duplicate user rows require manual review.'
      );
    }

    const collection = app.findCollectionByNameOrId('pbc_1562741241');

    // update collection data
    unmarshal(
      {
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_dashboard_settings_user` ON `user_dashboard_settings` (`user`)',
        ],
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_1562741241');

    // update collection data
    unmarshal(
      {
        indexes: [
          'CREATE INDEX IF NOT EXISTS `idx_user_dashboard_settings_user` ON `user_dashboard_settings` (`user`)',
        ],
      },
      collection
    );

    return app.save(collection);
  }
);
