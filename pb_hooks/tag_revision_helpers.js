const maximumTagLinks = 1000;

const tagRelations = {
  projects: {
    joins: 'project_tags',
    parentField: 'project',
    tags: 'tags',
  },
  coloring_books: {
    joins: 'coloring_book_tags',
    parentField: 'book',
    tags: 'coloring_tags',
  },
};

function guardedUpdate(e, { collection, conflictMessage, alwaysTransaction = false }) {
  const rawExpected = e.requestInfo().headers.x_og_expected_revision || '';
  const tagIds = requestedTagIds(e, rawExpected);
  if (rawExpected === '' && !alwaysTransaction) {
    e.next();
    return;
  }

  if (
    rawExpected !== '' &&
    (!/^(0|[1-9][0-9]*)$/.test(rawExpected) || !Number.isSafeInteger(Number(rawExpected)))
  ) {
    throw new BadRequestError('Invalid expected revision.');
  }

  const originalApp = e.app;
  originalApp.runInTransaction(txApp => {
    e.app = txApp;
    try {
      if (rawExpected !== '') {
        const current = txApp.findRecordById(collection, e.record.id);
        if (current.getString('user') !== (e.auth ? e.auth.getString('id') : '')) {
          throw new ApiError(403, conflictMessage);
        }
        if (current.getInt('revision') !== Number(rawExpected)) {
          throw new ApiError(409, conflictMessage);
        }
        const prepared =
          tagIds === null
            ? null
            : prepareTagSync(txApp, collection, current.id, current.getString('user'), tagIds);
        e.next();
        if (prepared) syncTags(txApp, e.context, current.id, prepared);
        return;
      }
      e.next();
    } finally {
      e.app = originalApp;
    }
  });
}

function requestedTagIds(e, expectedRevision) {
  const body = e.requestInfo().body || {};
  if (!Object.prototype.hasOwnProperty.call(body, 'og_tag_ids')) return null;
  if (expectedRevision === '') {
    throw new BadRequestError('Tag edits require an expected revision.');
  }

  const raw = body.og_tag_ids;
  if (typeof raw !== 'string' || raw.length > 32000) {
    throw new BadRequestError('Invalid tag selection.');
  }

  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new BadRequestError('Invalid tag selection.');
  }
  if (!Array.isArray(values) || values.length > maximumTagLinks) {
    throw new BadRequestError('Select at most 1000 tags.');
  }

  const ids = [];
  const seen = {};
  for (let i = 0; i < values.length; i += 1) {
    const id = values[i];
    if (typeof id !== 'string' || !/^[A-Za-z0-9_]{15}$/.test(id)) {
      throw new BadRequestError('Invalid tag selection.');
    }
    if (seen[id] !== true) {
      seen[id] = true;
      ids.push(id);
    }
  }
  return ids;
}

function prepareTagSync(app, collection, parentId, ownerId, ids) {
  const relation = tagRelations[collection];
  if (ids.length > 0) {
    const bindings = { ownerId };
    const placeholders = [];
    for (let i = 0; i < ids.length; i += 1) {
      const name = `tag${i}`;
      bindings[name] = ids[i];
      placeholders.push(`{:${name}}`);
    }
    const found = new DynamicModel({ count: 0 });
    app
      .db()
      .newQuery(
        `SELECT COUNT(*) AS count FROM ${relation.tags} WHERE user = {:ownerId} AND id IN (${placeholders.join(',')})`
      )
      .bind(bindings)
      .one(found);
    if (Number(found.count) !== ids.length) {
      throw new BadRequestError('Invalid tag selection.');
    }
  }

  const existing = app.findRecordsByFilter(
    relation.joins,
    `${relation.parentField} = {:parentId}`,
    '',
    maximumTagLinks + 1,
    0,
    { parentId }
  );
  if (existing.length > maximumTagLinks) {
    throw new BadRequestError('This item has too many tags to edit at once.');
  }

  const existingByTag = {};
  for (let i = 0; i < existing.length; i += 1) {
    existingByTag[existing[i].getString('tag')] = existing[i];
  }
  const desired = {};
  const added = [];
  for (let i = 0; i < ids.length; i += 1) {
    desired[ids[i]] = true;
    if (!existingByTag[ids[i]]) added.push(ids[i]);
  }
  const removed = existing.filter(join => desired[join.getString('tag')] !== true);
  if (added.length + removed.length > maximumTagLinks) {
    throw new BadRequestError('Change at most 1000 tag links at once.');
  }
  return { relation, added, removed };
}

function syncTags(app, requestContext, parentId, prepared) {
  const context = new Context(requestContext, 'organized_glitter_guarded_tag_sync', true);
  const collection = app.findCollectionByNameOrId(prepared.relation.joins);
  for (let i = 0; i < prepared.removed.length; i += 1) {
    app.deleteWithContext(context, prepared.removed[i]);
  }
  for (let i = 0; i < prepared.added.length; i += 1) {
    const join = new Record(collection);
    join.set(prepared.relation.parentField, parentId);
    join.set('tag', prepared.added[i]);
    app.saveWithContext(context, join);
  }
}

function reviseTagParent(e, relation, action) {
  if (e.context.value('organized_glitter_guarded_tag_sync') === true) {
    e.next();
    return;
  }

  const previousParentId =
    action === 'create' ? '' : e.record.original().getString(relation.parentField);
  const nextParentId = action === 'delete' ? '' : e.record.getString(relation.parentField);
  const originalApp = e.app;
  originalApp.runInTransaction(txApp => {
    e.app = txApp;
    try {
      if (action !== 'delete') {
        const parent = txApp.findRecordById(relation.parent, nextParentId);
        const tag = txApp.findRecordById(relation.tags, e.record.getString('tag'));
        if (parent.getString('user') !== tag.getString('user')) {
          throw new BadRequestError('Tag and item must have the same owner.');
        }
      }

      e.next();

      const parentIds =
        previousParentId === nextParentId ? [nextParentId] : [previousParentId, nextParentId];
      for (let i = 0; i < parentIds.length; i += 1) {
        if (!parentIds[i]) continue;
        let parent;
        try {
          parent = txApp.findRecordById(relation.parent, parentIds[i]);
        } catch {
          continue;
        }
        txApp.save(parent);
      }
    } finally {
      e.app = originalApp;
    }
  });
}

module.exports = { guardedUpdate, requestedTagIds, prepareTagSync, syncTags, reviseTagParent };
