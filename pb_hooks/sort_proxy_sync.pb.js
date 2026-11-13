/// <reference path="../pb_data/types.d.ts" />

// Keep project sort proxies in sync before persistence, without a second write.
onRecordCreate(e => {
  require(`${__hooks}/lifecycle_status.js`).applyCompletionStatus(e, 'date_completed', false);
  require(`${__hooks}/sort_proxy_helpers.js`).syncProject(e);
}, 'projects');

onRecordUpdate(e => {
  require(`${__hooks}/lifecycle_status.js`).applyCompletionStatus(e, 'date_completed', true);
  require(`${__hooks}/sort_proxy_helpers.js`).syncProject(e);
}, 'projects');

onRecordUpdate(e => {
  require(`${__hooks}/sort_proxy_helpers.js`).syncTaxonomyRename(e, 'company');
}, 'companies');

onRecordUpdate(e => {
  require(`${__hooks}/sort_proxy_helpers.js`).syncTaxonomyRename(e, 'artist');
}, 'artists');
