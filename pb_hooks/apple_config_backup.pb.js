/// <reference path="../pb_data/types.d.ts" />

onBackupCreate(e => {
  const directory = require(`${__hooks}/apple_config.js`).privateDirectory;
  e.exclude = [...e.exclude, directory];
  e.next();
});

onBackupRestore(e => {
  const directory = require(`${__hooks}/apple_config.js`).privateDirectory;
  e.exclude = [...e.exclude, directory];
  e.next();
});
