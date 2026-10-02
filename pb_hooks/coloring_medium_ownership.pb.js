/// <reference path="../pb_data/types.d.ts" />

// Authorization guard for the coloring_pages.mediums relation.
//
// The coloring_pages API rule authorizes writes on book.user == @request.auth.id
// but does NOT validate the targets of the `mediums` relation. Without this guard
// an authenticated user could attach another user's coloring_mediums record to
// their own page (an IDOR), and the coloring stats join would then disclose the
// foreign medium's name. These request hooks reject any write whose `mediums`
// value references a coloring_mediums record the requester does not own.
//
// Request hooks (onRecord*Request) are used instead of the persistence hooks in
// coloring.pb.js on purpose: they carry the request auth (e.auth) and fire only
// for client API calls, so the internal system saves performed by the metrics
// hooks are never affected.

onRecordCreateRequest(e => {
  // readRelationIds normalizes the JSVM representation of a multi-relation field
  // into a plain array of id strings. PocketBase usually returns an array here,
  // but JSON-backed values can arrive as a JSON string or as a byte array, so we
  // defensively handle each shape (see the dashboard_settings hook for the same
  // byte-array quirk).
  const readRelationIds = function (raw) {
    if (raw === null || raw === undefined || raw === '') {
      return [];
    }

    if (Array.isArray(raw)) {
      const looksLikeBytes = raw.length > 0 && typeof raw[0] === 'number';
      if (looksLikeBytes) {
        let text = '';
        for (let i = 0; i < raw.length; i += 1) {
          text += String.fromCharCode(raw[i]);
        }
        return readRelationIds(text);
      }

      const ids = [];
      for (let i = 0; i < raw.length; i += 1) {
        const id = String(raw[i] || '').trim();
        if (id !== '') {
          ids.push(id);
        }
      }
      return ids;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '') {
        return [];
      }
      if (trimmed.charAt(0) === '[') {
        try {
          return readRelationIds(JSON.parse(trimmed));
        } catch (_err) {
          return [];
        }
      }
      return [trimmed];
    }

    return [];
  };

  const authId = e.auth ? e.auth.getString('id') : '';
  if (authId === '') {
    throw new ForbiddenError('Authentication is required.');
  }
  const mediumIds = readRelationIds(e.record.get('mediums'));

  if (mediumIds.length > 0) {
    for (let i = 0; i < mediumIds.length; i += 1) {
      const mediumId = mediumIds[i];
      let medium = null;
      try {
        medium = e.app.findRecordById('coloring_mediums', mediumId);
      } catch (_err) {
        throw new BadRequestError('Invalid medium reference.', {
          mediums: 'One or more referenced mediums do not exist.',
        });
      }

      if (medium.getString('user') !== authId) {
        throw new BadRequestError('Invalid medium reference.', {
          mediums: 'One or more referenced mediums are not owned by the current user.',
        });
      }
    }
  }

  e.next();
}, 'coloring_pages');

onRecordUpdateRequest(e => {
  const readRelationIds = function (raw) {
    if (raw === null || raw === undefined || raw === '') {
      return [];
    }

    if (Array.isArray(raw)) {
      const looksLikeBytes = raw.length > 0 && typeof raw[0] === 'number';
      if (looksLikeBytes) {
        let text = '';
        for (let i = 0; i < raw.length; i += 1) {
          text += String.fromCharCode(raw[i]);
        }
        return readRelationIds(text);
      }

      const ids = [];
      for (let i = 0; i < raw.length; i += 1) {
        const id = String(raw[i] || '').trim();
        if (id !== '') {
          ids.push(id);
        }
      }
      return ids;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '') {
        return [];
      }
      if (trimmed.charAt(0) === '[') {
        try {
          return readRelationIds(JSON.parse(trimmed));
        } catch (_err) {
          return [];
        }
      }
      return [trimmed];
    }

    return [];
  };

  const authId = e.auth ? e.auth.getString('id') : '';
  if (authId === '') {
    throw new ForbiddenError('Authentication is required.');
  }
  const nextIds = readRelationIds(e.record.get('mediums'));

  // Only newly introduced mediums need an ownership check. Ids already present on
  // the stored record were validated on a prior write, so re-checking them would
  // reject legitimate updates if an allowlisted medium were later edited.
  const previousIds = readRelationIds(e.record.original().get('mediums'));
  const previousLookup = {};
  for (let i = 0; i < previousIds.length; i += 1) {
    previousLookup[previousIds[i]] = true;
  }

  if (nextIds.length > 0) {
    for (let i = 0; i < nextIds.length; i += 1) {
      const mediumId = nextIds[i];
      if (previousLookup[mediumId] === true) {
        continue;
      }

      let medium = null;
      try {
        medium = e.app.findRecordById('coloring_mediums', mediumId);
      } catch (_err) {
        throw new BadRequestError('Invalid medium reference.', {
          mediums: 'One or more referenced mediums do not exist.',
        });
      }

      if (medium.getString('user') !== authId) {
        throw new BadRequestError('Invalid medium reference.', {
          mediums: 'One or more referenced mediums are not owned by the current user.',
        });
      }
    }
  }

  e.next();
}, 'coloring_pages');
