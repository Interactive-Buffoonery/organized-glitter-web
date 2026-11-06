/// <reference path="../pb_data/types.d.ts" />

// Keep project sort proxies in sync before persistence, without a second write.
onRecordCreate(e => {
  try {
    require(`${__hooks}/lifecycle_status.js`).applyCompletionStatus(e, 'date_completed', false);
  } catch (err) {
    e.app.logger().error('lifecycle_status: failed to sync project', { error: String(err) });
  }
  require(`${__hooks}/sort_proxy_helpers.js`).syncProject(e);
}, 'projects');

onRecordUpdate(e => {
  try {
    require(`${__hooks}/lifecycle_status.js`).applyCompletionStatus(e, 'date_completed', true);
  } catch (err) {
    e.app.logger().error('lifecycle_status: failed to sync project', { error: String(err) });
  }
  require(`${__hooks}/sort_proxy_helpers.js`).syncProject(e);
}, 'projects');

onRecordUpdate(e => {
  require(`${__hooks}/sort_proxy_helpers.js`).syncTaxonomyRename(e, 'company');
}, 'companies');

onRecordUpdate(e => {
  require(`${__hooks}/sort_proxy_helpers.js`).syncTaxonomyRename(e, 'artist');
}, 'artists');
