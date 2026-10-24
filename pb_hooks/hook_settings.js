/// <reference path="../pb_data/types.d.ts" />

// Hosts without custom environment variables (such as PikaPods) supply hook
// settings in `<data directory>/hook-settings-private/config.json`, keyed by
// the environment variable name. The environment takes precedence.
const PRIVATE_DIRECTORY = 'hook-settings-private';

module.exports = {
  privateDirectory: PRIVATE_DIRECTORY,
  get(app, name) {
    const fromEnvironment = String($os.getenv(name) || '').trim();
    if (fromEnvironment) return fromEnvironment;
    const result = require(`${__hooks}/private_json.js`).read(app, PRIVATE_DIRECTORY);
    if (result.reason) {
      if (result.reason !== 'missing') {
        app
          .logger()
          .warn('Hook settings are unavailable.', 'reason', `hook_settings_${result.reason}`);
      }
      return '';
    }
    const value = result.config[name];
    return typeof value === 'string' ? value.trim() : '';
  },
};
