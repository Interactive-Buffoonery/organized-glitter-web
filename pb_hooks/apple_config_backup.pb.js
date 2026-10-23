/// <reference path="../pb_data/types.d.ts" />

onBackupCreate(e => {
  e.exclude = [
    ...e.exclude,
    require(`${__hooks}/apple_config.js`).privateDirectory,
    require(`${__hooks}/hook_settings.js`).privateDirectory,
  ];
  e.next();
});

onBackupRestore(e => {
  e.exclude = [
    ...e.exclude,
    require(`${__hooks}/apple_config.js`).privateDirectory,
    require(`${__hooks}/hook_settings.js`).privateDirectory,
  ];
  e.next();
});
