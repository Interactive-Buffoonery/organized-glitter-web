/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const fields = [
    ["pbc_484305853", "image"],
    ["pbc_2820000003", "cover_image"],
    ["pbc_2820000004", "photos"],
    ["pbc_3293061152", "image"],
    ["pbc_4218181872", "image"]
  ]

  for (const [collectionName, fieldName] of fields) {
    const collection = app.findCollectionByNameOrId(collectionName)
    const field = collection.fields.getByName(fieldName)
    const thumbs = field.thumbs || []
    for (const size of ["480x600f", "960x1200f"]) {
      if (!thumbs.includes(size)) {
        thumbs.push(size)
      }
    }
    field.thumbs = thumbs
    app.save(collection)
  }
}, (app) => {
  const fields = [
    ["pbc_484305853", "image"],
    ["pbc_2820000003", "cover_image"],
    ["pbc_2820000004", "photos"],
    ["pbc_3293061152", "image"],
    ["pbc_4218181872", "image"]
  ]

  for (const [collectionName, fieldName] of fields) {
    const collection = app.findCollectionByNameOrId(collectionName)
    const field = collection.fields.getByName(fieldName)
    field.thumbs = (field.thumbs || []).filter((size) => size !== "480x600f" && size !== "960x1200f")
    app.save(collection)
  }
})
