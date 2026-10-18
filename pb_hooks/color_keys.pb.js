/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(e => {
  const helpers = require(`${__hooks}/color_keys.js`);
  e.record.set('tried', helpers.prepareKeyCreate(e.requestInfo().body));
  e.next();
}, 'coloring_page_color_keys');

onRecordValidate(e => {
  require(`${__hooks}/color_keys.js`).validateKey(e.record);
  e.next();
}, 'coloring_page_color_keys');

onRecordCreateRequest(e => {
  if (!e.hasSuperuserAuth()) {
    if (!e.auth || !e.auth.getBool('verified'))
      throw new ForbiddenError('Email verification is required.');
    require(`${__hooks}/color_keys.js`).rateLimit(e.app, e.auth.id);
  }
  e.next();
}, 'coloring_symbol_requests');

onRecordCreate(e => {
  e.record.set('status', 'open');
  e.record.set('resolved_symbol', '');
  e.next();
}, 'coloring_symbol_requests');

onRecordAfterCreateSuccess(e => {
  require(`${__hooks}/color_keys.js`).notify(e.app, e.record, false);
  e.next();
}, 'coloring_symbol_requests');

onRecordUpdate(e => {
  require(`${__hooks}/color_keys.js`).resolveRequest(e);
}, 'coloring_symbol_requests');

onRecordAfterUpdateSuccess(e => {
  if (e.record.getBool('_colorKeyResolutionNotify')) {
    require(`${__hooks}/color_keys.js`).notify(e.app, e.record, true);
  }
  e.next();
}, 'coloring_symbol_requests');
