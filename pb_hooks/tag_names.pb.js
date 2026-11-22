/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(
  e => {
    require(`${__hooks}/tag_names.js`).rejectDuplicateTagName(e);
    e.next();
  },
  'tags',
  'coloring_tags'
);

onRecordUpdateRequest(
  e => {
    require(`${__hooks}/tag_names.js`).rejectDuplicateTagName(e);
    e.next();
  },
  'tags',
  'coloring_tags'
);
