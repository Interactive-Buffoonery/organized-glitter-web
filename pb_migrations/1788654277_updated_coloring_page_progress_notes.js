/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4218181872")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_coloring_page_progress_notes_page_user_date_created_id` ON `coloring_page_progress_notes` (`page`, `user`, `date` DESC, `created` DESC, `id` DESC)",
      "CREATE INDEX `idx_coloring_page_progress_notes_user_date_created_id` ON `coloring_page_progress_notes` (`user`, `date` DESC, `created` DESC, `id` DESC)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4218181872")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
