/// <reference path="../pb_data/types.d.ts" />

const PRIVATE_DIRECTORY = 'apple-auth-private';

function unavailable(app, reason) {
  app.logger().warn('Apple configuration is unavailable.', 'reason', reason);
  throw new Error('Apple configuration is unavailable.');
}

module.exports = {
  privateDirectory: PRIVATE_DIRECTORY,
  unavailable,
  read(app) {
    const directory = PRIVATE_DIRECTORY;
    const file = `${directory}/config.json`;
    let root;
    try {
      root = $os.openRoot(app.dataDir());
    } catch (_) {
      return unavailable(app, 'apple_config_unreadable');
    }
    try {
      let directoryInfo;
      let fileInfo;
      try {
        directoryInfo = root.lstat(directory);
        fileInfo = root.lstat(file);
      } catch (_) {
        return unavailable(app, 'apple_config_unreadable');
      }
      if (
        !directoryInfo.isDir() ||
        (directoryInfo.mode().perm() & 0o077) !== 0 ||
        !fileInfo.mode().isRegular() ||
        (fileInfo.mode().perm() & 0o077) !== 0 ||
        fileInfo.size() > 16384
      ) {
        return unavailable(app, 'apple_config_unsafe_file');
      }
      let openedFile;
      try {
        openedFile = root.open(file);
      } catch (_) {
        return unavailable(app, 'apple_config_unreadable');
      }
      let config;
      try {
        const openedInfo = openedFile.stat();
        if (
          !openedInfo.mode().isRegular() ||
          (openedInfo.mode().perm() & 0o077) !== 0 ||
          openedInfo.size() > 16384
        ) {
          return unavailable(app, 'apple_config_unsafe_file');
        }
        try {
          config = JSON.parse(readerToString(openedFile));
        } catch (_) {
          return unavailable(app, 'apple_config_invalid_json');
        }
      } finally {
        openedFile.close();
      }
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return unavailable(app, 'apple_config_invalid_json');
      }
      if (typeof config.teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(config.teamId)) {
        return unavailable(app, 'apple_config_invalid_team_id');
      }
      if (typeof config.keyId !== 'string' || !/^[A-Z0-9]{10}$/.test(config.keyId)) {
        return unavailable(app, 'apple_config_invalid_key_id');
      }
      if (
        typeof config.privateKey !== 'string' ||
        !config.privateKey.includes('BEGIN PRIVATE KEY')
      ) {
        return unavailable(app, 'apple_config_invalid_signing_key');
      }
      if (
        typeof config.grantEncryptionKey !== 'string' ||
        !/^[!-~]{32}$/.test(config.grantEncryptionKey)
      ) {
        return unavailable(app, 'apple_config_invalid_grant_key');
      }
      return config;
    } finally {
      root.close();
    }
  },
};
