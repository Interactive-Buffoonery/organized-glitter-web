/// <reference path="../pb_data/types.d.ts" />

const CRAFTING_TRACKED_COLLECTIONS = require(`${__hooks}/crafting_activity.js`).TRACKED_COLLECTIONS;

onRecordCreateRequest(
  e => {
    require(`${__hooks}/crafting_activity.js`).afterRequest(e);
  },
  ...CRAFTING_TRACKED_COLLECTIONS
);

onRecordUpdateRequest(
  e => {
    require(`${__hooks}/crafting_activity.js`).afterRequest(e);
  },
  ...CRAFTING_TRACKED_COLLECTIONS
);

onRecordDeleteRequest(
  e => {
    require(`${__hooks}/crafting_activity.js`).afterRequest(e);
  },
  ...CRAFTING_TRACKED_COLLECTIONS
);

onRecordCreateRequest(e => {
  require(`${__hooks}/crafting_activity.js`).validateMarkDay(e.record.getString('day'), Date.now());
  e.next();
}, 'crafting_day_marks');
