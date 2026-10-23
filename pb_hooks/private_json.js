/// <reference path="../pb_data/types.d.ts" />

const MAX_BYTES = 16384;

// Reads `<data directory>/<directory>/config.json` only when the directory and
// file are owner-only and the file is a small regular file. Returns { config }
// or { reason } with one of: missing, unreadable, unsafe_file, invalid_json.
module.exports = {
  read(app, directory) {
    const file = `${directory}/config.json`;
    let root;
    try {
      root = $os.openRoot(app.dataDir());
    } catch (_) {
      return { reason: 'unreadable' };
    }
    try {
      let directoryInfo;
      let fileInfo;
      try {
        directoryInfo = root.lstat(directory);
      } catch (_) {
        return { reason: 'missing' };
      }
      try {
        fileInfo = root.lstat(file);
      } catch (_) {
        return { reason: 'missing' };
      }
      if (
        !directoryInfo.isDir() ||
        (directoryInfo.mode().perm() & 0o077) !== 0 ||
        !fileInfo.mode().isRegular() ||
        (fileInfo.mode().perm() & 0o077) !== 0 ||
        fileInfo.size() > MAX_BYTES
      ) {
        return { reason: 'unsafe_file' };
      }
      let openedFile;
      try {
        openedFile = root.open(file);
      } catch (_) {
        return { reason: 'unreadable' };
      }
      let config;
      try {
        const openedInfo = openedFile.stat();
        if (
          !openedInfo.mode().isRegular() ||
          (openedInfo.mode().perm() & 0o077) !== 0 ||
          openedInfo.size() > MAX_BYTES
        ) {
          return { reason: 'unsafe_file' };
        }
        try {
          config = JSON.parse(readerToString(openedFile));
        } catch (_) {
          return { reason: 'invalid_json' };
        }
      } finally {
        openedFile.close();
      }
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { reason: 'invalid_json' };
      }
      return { config };
    } finally {
      root.close();
    }
  },
};
