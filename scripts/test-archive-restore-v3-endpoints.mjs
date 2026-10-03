import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  calculateItemDigest,
  calculateParentDescriptorDigest,
} from '../src/features/import-export/archive/v3/canonical.ts';

const baseUrl = process.env.PB_URL;
const adminToken = process.env.PB_ADMIN_TOKEN;
const imagePath = process.env.TEST_IMAGE_PATH;
if (!baseUrl || !adminToken || !imagePath)
  throw new Error('Set PB_URL, PB_ADMIN_TOKEN, and TEST_IMAGE_PATH for a disposable PocketBase.');

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const backupId = randomUUID();
const password = `Int1077-${suffix}-Password!`;
const adminHeaders = { authorization: adminToken };
const jsonHeaders = { ...adminHeaders, 'content-type': 'application/json' };
const bytes = await readFile(imagePath);
const assetDigest = createHash('sha256').update(bytes).digest('hex');
const createdUserIds = [];
let userId = '';
let authHeaders;

async function json(promise) {
  const response = await promise;
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}
function expectStatus(result, status) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  return result.body;
}
async function createUser(label) {
  const identity = `int1077-${label}-${suffix}@example.test`;
  const created = await json(
    fetch(`${baseUrl}/api/collections/users/records`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        username: `i7${label[0]}${suffix}`,
        email: identity,
        password,
        passwordConfirm: password,
        verified: true,
      }),
    })
  );
  const id = expectStatus(created, 200).id;
  createdUserIds.push(id);
  const authenticated = await json(
    fetch(`${baseUrl}/api/collections/users/auth-with-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity, password }),
    })
  );
  return { id, headers: { authorization: expectStatus(authenticated, 200).token } };
}

const digest = character => character.repeat(64);
const asset = (assetId, role, field) => ({
  assetId,
  digest: assetDigest,
  byteLength: bytes.length,
  path: `assets/${assetId}/photo.png`,
  role,
  field,
  originalFilename: 'photo.png',
  contentType: 'image/png',
});
const descriptor = item => {
  const value = {
    itemId: item.itemId,
    kind: item.kind,
    metadata: item.metadata,
    ...(item.parent ? { parent: descriptor(item.parent) } : {}),
  };
  return { ...value, digest: calculateParentDescriptorDigest(value) };
};
const project = (id, metadata = {}) =>
  descriptor({
    itemId: `diamond-project:${id}`,
    kind: 'diamond-project',
    metadata: { title: `Project ${id}`, status: 'progress', tags: [], ...metadata },
  });
const book = (id, metadata = {}) =>
  descriptor({
    itemId: `coloring-book:${id}`,
    kind: 'coloring-book',
    metadata: {
      title: `Book ${id}`,
      isMystery: false,
      status: 'in_progress',
      totalPages: 12,
      tags: [],
      ...metadata,
    },
  });
const page = (id, parent, metadata = {}) =>
  descriptor({
    itemId: `coloring-page:${id}`,
    kind: 'coloring-page',
    parent: descriptor(parent),
    metadata: { pageNumber: 3, status: 'in_progress', mediumItemIds: [], ...metadata },
  });
const complete = (item, assets = []) => {
  const value = {
    itemId: item.itemId,
    kind: item.kind,
    ...(item.parent ? { parent: descriptor(item.parent) } : {}),
    metadata: item.metadata,
    assets,
  };
  return { ...value, digest: calculateItemDigest(value) };
};

async function restore(item, options = {}) {
  const form = new FormData();
  form.set(
    'request',
    JSON.stringify({
      backupId: options.backupId ?? backupId,
      partNumber: options.partNumber ?? 1,
      partCount: options.partCount ?? 8,
      inventoryDigest: digest('9'),
      item,
    })
  );
  for (const descriptor of item.assets ?? [])
    form.set(
      `asset:${descriptor.assetId}`,
      new Blob([options.fileBytes ?? bytes], { type: 'image/png' }),
      descriptor.originalFilename
    );
  for (const extra of options.extraFiles ?? [])
    form.append(
      extra.field,
      new Blob([extra.bytes ?? bytes], { type: 'image/png' }),
      extra.name ?? 'extra.png'
    );
  for (const missing of options.missingFiles ?? []) form.delete(`asset:${missing}`);
  return json(
    fetch(`${baseUrl}/api/archive/v3/restore-item`, {
      method: 'POST',
      headers: options.headers ?? authHeaders,
      body: form,
    })
  );
}
async function getRecord(collection, id, headers = authHeaders) {
  return json(fetch(`${baseUrl}/api/collections/${collection}/records/${id}`, { headers }));
}
async function list(collection, filter, headers = adminHeaders) {
  const query = new URLSearchParams({ perPage: '200', filter });
  const result = await json(
    fetch(`${baseUrl}/api/collections/${collection}/records?${query}`, { headers })
  );
  return expectStatus(result, 200).items;
}
async function receipt(itemId) {
  const records = await list(
    'archive_restore_items',
    `user = "${userId}" && backup_id = "${backupId}" && item_id = "${itemId}"`
  );
  assert.equal(records.length, 1, `expected one receipt for ${itemId}`);
  return records[0];
}
async function created(item, collection) {
  const response = await restore(item);
  const body = expectStatus(response, 200);
  assert.equal(body.outcome, 'created');
  const record = expectStatus(await getRecord(collection, body.targetRecordId), 200);
  const savedReceipt = await receipt(item.itemId);
  assert.equal(savedReceipt.state, 'complete');
  assert.equal(savedReceipt.target_collection, collection);
  assert.equal(savedReceipt.target_record_id, record.id);
  return { body, record, receipt: savedReceipt };
}

try {
  const owner = await createUser('owner');
  userId = owner.id;
  authHeaders = owner.headers;
  const outsider = await createUser('outsider');

  const capability = await json(
    fetch(`${baseUrl}/api/archive/capabilities`, { headers: authHeaders })
  );
  assert.deepEqual(expectStatus(capability, 200).restoreSchemaVersions, [1, 2, 3]);
  assert.deepEqual(capability.body.maxAssetBytesByRole, {
    'project-cover': 10485760,
    'project-progress-note': 10485760,
    'coloring-book-cover': 10485760,
    'coloring-page-photo': 10485760,
    'coloring-page-progress-note': 10485760,
    'coloring-swatch-photo': 52428800,
  });
  assert.equal(capability.body.maxRestoreRequestChars, 500000);
  assert.equal(capability.body.maxMetadataStringChars, 100000);
  assert.equal(capability.body.maxMetadataListEntries, 1000);
  assert.equal(capability.body.maxMetadataListEntryChars, 255);
  assert.equal(capability.body.maxMetadataNumber, 1000000000);
  assert.equal(capability.body.maxAssetPosition, 1000000);
  assert.equal((await restore(complete(project('unauth')), { headers: {} })).response.status, 401);

  const mediumItem = complete({
    itemId: 'coloring-medium:all-kinds',
    kind: 'coloring-medium',
    digest: digest('4'),
    metadata: {
      name: 'Prismacolor Premier',
      type: 'colored_pencil',
      brand: 'Prismacolor',
      colorCount: 150,
      notes: 'Soft core',
    },
  });
  const mediumResult = await created(mediumItem, 'coloring_mediums');
  assert.equal(mediumResult.record.name, 'Prismacolor Premier');
  assert.equal(mediumResult.record.color_count, 150);

  const projectItem = complete(
    project('all-kinds', {
      company: 'Same Name',
      artist: 'Same Name',
      kitCategory: 'mini',
      drillShape: 'round',
      width: 20,
      height: 30,
      totalDiamonds: 1234,
      colorCount: 24,
      generalNotes: 'Project fields survived',
      tags: ['Shared Tag', 'Project Only', 'shared tag'],
    }),
    [asset('project-cover', 'project-cover', 'image')]
  );
  const projectResult = await created(projectItem, 'projects');
  assert.equal(projectResult.record.general_notes, 'Project fields survived');
  assert.ok(projectResult.record.image);
  assert.notEqual(projectResult.record.company, projectResult.record.artist);

  const projectNote = complete(
    {
      itemId: 'diamond-project-note:all-kinds',
      kind: 'diamond-project-note',
      digest: digest('5'),
      parent: projectItem,
      metadata: { content: 'Same note text', date: '2026-09-20' },
    },
    [asset('project-note-image', 'project-progress-note', 'image')]
  );
  const projectNoteResult = await created(projectNote, 'progress_notes');
  assert.equal(projectNoteResult.record.project, projectResult.record.id);
  assert.ok(projectNoteResult.record.image);
  const sameNameNote = complete({
    ...projectNote,
    itemId: 'diamond-project-note:same-name-distinct',
    digest: digest('6'),
  });
  const sameNameResult = await created(sameNameNote, 'progress_notes');
  assert.notEqual(sameNameResult.record.id, projectNoteResult.record.id);
  assert.equal(sameNameResult.record.content, projectNoteResult.record.content);

  assert.equal((await list('project_tags', `project = "${projectResult.record.id}"`)).length, 2);
  const prototypeProject = await created(
    complete(
      project('prototype-tags', {
        tags: ['constructor', 'toString', '__proto__', 'CONSTRUCTOR'],
      })
    ),
    'projects'
  );
  const prototypeJoins = await list('project_tags', `project = "${prototypeProject.record.id}"`);
  assert.equal(prototypeJoins.length, 3);
  for (const name of ['constructor', 'toString', '__proto__']) {
    const matches = await list('tags', `user = "${userId}" && name = "${name}"`);
    assert.equal(matches.length, 1, `tag ${name} must be restored`);
    assert.ok(prototypeJoins.some(join => join.tag === matches[0].id));
  }
  assert.equal((await list('companies', `user = "${userId}" && name = "Same Name"`)).length, 1);
  assert.equal((await list('artists', `user = "${userId}" && name = "Same Name"`)).length, 1);

  // The supported maximum must not perform one normalized-name scan per tag.
  const largeTagNames = Array.from({ length: 1000 }, (_, index) => `Large tag ${index}`);
  const sqlLogPath = process.env.PB_SQL_LOG_PATH;
  assert.ok(sqlLogPath, 'The disposable runner must capture PocketBase SQL logging.');
  const beforeLargeTags = (await readFile(sqlLogPath, 'utf8')).length;
  const largeTagItem = complete(project('large-tags', { tags: largeTagNames }));
  const largeTagResult = await created(largeTagItem, 'projects');
  const largeTagSql = (await readFile(sqlLogPath, 'utf8')).slice(beforeLargeTags);
  const tagLookups = largeTagSql
    .split('\n')
    .filter(
      line =>
        /SELECT/i.test(line) &&
        /FROM [`"]?tags[`"]?/i.test(line) &&
        /LOWER\(TRIM\(name\)\)/i.test(line)
    );
  assert.ok(tagLookups.length > 0, 'The SQL observer must see the normalized-name queries.');
  assert.ok(
    tagLookups.length <= 4,
    `1000 tags must use at most four name lookups, observed ${tagLookups.length}`
  );
  const allLargeJoins = expectStatus(
    await json(
      fetch(
        `${baseUrl}/api/collections/project_tags/records?perPage=1&filter=${encodeURIComponent(`project = "${largeTagResult.record.id}"`)}`,
        { headers: adminHeaders }
      )
    ),
    200
  );
  assert.equal(allLargeJoins.totalItems, 1000);
  assert.equal(expectStatus(await restore(largeTagItem), 200).outcome, 'already_applied');
  const reusedTags = await created(
    complete(
      project('large-tags-reused', {
        tags: largeTagNames.map(name => `  ${name.toUpperCase()}  `),
      })
    ),
    'projects'
  );
  assert.notEqual(reusedTags.record.id, largeTagResult.record.id);
  const tagCount = expectStatus(
    await json(
      fetch(
        `${baseUrl}/api/collections/tags/records?perPage=1&filter=${encodeURIComponent(`user = "${userId}" && name ~ "Large tag "`)}`,
        { headers: adminHeaders }
      )
    ),
    200
  );
  assert.equal(tagCount.totalItems, 1000);

  console.log(`1000-tag restore used ${tagLookups.length} normalized-name queries`);
  const foreignTag = expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/tags/records`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          user: outsider.id,
          name: 'Foreign taxonomy',
          slug: 'foreign',
          color: '#8b5cf6',
        }),
      })
    ),
    200
  );
  const caseTags = [];
  for (const name of ['Case Variant', 'CASE VARIANT', 'éclair']) {
    caseTags.push(
      expectStatus(
        await json(
          fetch(`${baseUrl}/api/collections/tags/records`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ user: userId, name, slug: 'case', color: '#8b5cf6' }),
          })
        ),
        200
      )
    );
  }
  const folded = await created(
    complete(
      project('folded-existing-tags', {
        tags: ['  case variant  ', 'CASE VARIANT', 'Foreign taxonomy', 'Éclair'],
      })
    ),
    'projects'
  );
  const foldedJoins = await list('project_tags', `project = "${folded.record.id}"`);
  assert.equal(foldedJoins.length, 3);
  assert.ok(
    foldedJoins.some(join => join.tag === caseTags[0].id),
    'ambiguous ASCII case variants must retain the original first-match selection'
  );
  assert.ok(foldedJoins.every(join => join.tag !== foreignTag.id && join.tag !== caseTags[2].id));
  const upperAccent = await list('tags', `user = "${userId}" && name = "Éclair"`);
  assert.equal(
    upperAccent.length,
    1,
    'SQLite ASCII folding must not merge non-ASCII case variants'
  );
  const expectedFirstTag = createHash('sha256')
    .update(`${userId}\0${backupId}\0taxonomy:tags:large tag 0`)
    .digest('hex')
    .slice(0, 15);
  assert.equal(
    (await list('tags', `user = "${userId}" && name = "Large tag 0"`))[0].id,
    expectedFirstTag
  );
  const largeBook = complete(book('large-tags', { tags: largeTagNames }));
  const bookSqlStart = (await readFile(sqlLogPath, 'utf8')).length;
  const largeBookResult = await created(largeBook, 'coloring_books');
  const bookSql = (await readFile(sqlLogPath, 'utf8')).slice(bookSqlStart);
  const bookTagLookups = bookSql
    .split('\n')
    .filter(
      line =>
        /SELECT/i.test(line) &&
        /FROM [`"]?coloring_tags[`"]?/i.test(line) &&
        /LOWER\(TRIM\(name\)\)/i.test(line)
    );
  assert.equal(bookTagLookups.length, 4);
  assert.equal(
    expectStatus(
      await json(
        fetch(
          `${baseUrl}/api/collections/coloring_book_tags/records?perPage=1&filter=${encodeURIComponent(`book = "${largeBookResult.record.id}"`)}`,
          { headers: adminHeaders }
        )
      ),
      200
    ).totalItems,
    1000
  );
  assert.equal(expectStatus(await restore(largeBook), 200).outcome, 'already_applied');
  assert.equal(
    (
      await restore(
        complete(
          project('over-tag-limit', {
            tags: [...largeTagNames, 'One too many'],
          })
        )
      )
    ).response.status,
    400
  );

  const bookItem = complete(
    book('all-kinds', {
      publisher: 'Same Publisher',
      illustrator: 'Same Illustrator',
      series: 'Botanical Worlds',
      isbn: '9780000000002',
      publicationYear: 2025,
      language: 'english',
      bookFormat: 'hardcover',
      notes: 'Book fields survived',
      tags: ['Shared Tag', 'Book Only', 'SHARED TAG'],
    }),
    [asset('book-cover', 'coloring-book-cover', 'cover_image')]
  );
  const bookResult = await created(bookItem, 'coloring_books');
  assert.equal(bookResult.record.series, 'Botanical Worlds');
  assert.equal(bookResult.record.publication_year, 2025);
  assert.ok(bookResult.record.cover_image);
  assert.equal(
    (await list('book_publishers', `user = "${userId}" && name = "Same Publisher"`)).length,
    1
  );
  assert.equal(
    (await list('book_illustrators', `user = "${userId}" && name = "Same Illustrator"`)).length,
    1
  );
  assert.equal((await list('coloring_book_tags', `book = "${bookResult.record.id}"`)).length, 2);
  const prototypeBook = await created(
    complete(
      book('prototype-tags', {
        tags: ['constructor', 'toString', '__proto__'],
      })
    ),
    'coloring_books'
  );
  const prototypeBookJoins = await list(
    'coloring_book_tags',
    `book = "${prototypeBook.record.id}"`
  );
  assert.equal(prototypeBookJoins.length, 3);
  for (const name of ['constructor', 'toString', '__proto__']) {
    const matches = await list('coloring_tags', `user = "${userId}" && name = "${name}"`);
    assert.equal(matches.length, 1, `book tag ${name} must be restored`);
    assert.ok(prototypeBookJoins.some(join => join.tag === matches[0].id));
  }
  const fuzzyCandidate = expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/book_publishers/records`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ user: userId, name: 'Black Oak Press' }),
      })
    ),
    200
  );
  const exactBook = await created(
    complete(book('exact-publisher', { publisher: 'Oak' })),
    'coloring_books'
  );
  assert.notEqual(exactBook.record.publisher, fuzzyCandidate.id);
  assert.equal((await list('book_publishers', `user = "${userId}" && name = "Oak"`)).length, 1);
  const caseBook = await created(
    complete(book('case-publisher', { publisher: 'OAK' })),
    'coloring_books'
  );
  assert.equal(caseBook.record.publisher, exactBook.record.publisher);

  const pageItem = complete(
    page('all-kinds', bookItem, {
      mediumItemIds: [mediumItem.itemId],
      revealedSubject: 'Fox',
      startedAt: '2026-09-19',
    })
  );
  const pageResult = await created(pageItem, 'coloring_pages');
  assert.equal(
    pageResult.body.scaffoldedParentCount,
    0,
    'a completed page must not count its own temporary scaffold as a parent'
  );
  assert.equal(pageResult.record.book, bookResult.record.id);
  assert.deepEqual(pageResult.record.mediums, [mediumResult.record.id]);
  assert.equal(pageResult.record.revealed_subject, 'Fox');
  const bookPages = await list('coloring_pages', `book = "${bookResult.record.id}"`);
  assert.equal(bookPages.length, 1, 'independent book/page parts must create one real page');
  assert.equal(bookPages[0].id, pageResult.record.id);

  const metricsBook = book('metrics', {
    totalPages: 4,
    completedPages: 3,
    completionPercentage: 75,
  });
  const firstCompleted = complete(
    page('metrics-first', metricsBook, { pageNumber: 1, status: 'completed' })
  );
  const firstCompletedResult = await created(firstCompleted, 'coloring_pages');
  assert.equal(
    firstCompletedResult.body.scaffoldedParentCount,
    1,
    'a page restored before its book must count only the book scaffold'
  );
  const metricsReceipt = await receipt(metricsBook.itemId);
  let metricsRecord = expectStatus(
    await getRecord('coloring_books', metricsReceipt.target_record_id),
    200
  );
  assert.equal(metricsRecord.completed_pages, 1);
  assert.equal(metricsRecord.completion_percentage, 25);
  await created(
    complete(page('metrics-second', metricsBook, { pageNumber: 2, status: 'completed' })),
    'coloring_pages'
  );
  metricsRecord = expectStatus(
    await getRecord('coloring_books', metricsReceipt.target_record_id),
    200
  );
  assert.equal(metricsRecord.completed_pages, 2);
  assert.equal(metricsRecord.completion_percentage, 50);
  expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/coloring_books/records/${metricsRecord.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ completed_pages: 4, completion_percentage: 100 }),
      })
    ),
    200
  );
  await created(
    complete(page('metrics-third', metricsBook, { pageNumber: 3, status: 'completed' })),
    'coloring_pages'
  );
  metricsRecord = expectStatus(
    await getRecord('coloring_books', metricsReceipt.target_record_id),
    200
  );
  assert.equal(metricsRecord.completed_pages, 4);
  assert.equal(metricsRecord.completion_percentage, 100);

  const pageNote = complete(
    {
      itemId: 'coloring-page-note:all-kinds',
      kind: 'coloring-page-note',
      digest: digest('7'),
      parent: pageItem,
      metadata: { content: 'Same note text', date: '2026-09-21' },
    },
    [asset('page-note-image', 'coloring-page-progress-note', 'image')]
  );
  const pageNoteResult = await created(pageNote, 'coloring_page_progress_notes');
  assert.equal(pageNoteResult.record.page, pageResult.record.id);
  assert.ok(pageNoteResult.record.image);

  const reference = complete({
    itemId: 'coloring-color-reference:all-kinds',
    kind: 'coloring-color-reference',
    digest: digest('8'),
    parent: pageItem,
    metadata: { notes: 'Skin palette' },
  });
  const referenceResult = await created(reference, 'coloring_page_color_references');
  assert.equal(referenceResult.record.page, pageResult.record.id);
  assert.equal(referenceResult.record.notes, 'Skin palette');

  const longReference = complete({
    itemId: `coloring-color-reference:${'x'.repeat(220)}`,
    kind: 'coloring-color-reference',
    parent: page('long-reference', book('long-reference')),
    metadata: { notes: 'Long item ID' },
  });
  const longReferenceResult = await created(longReference, 'coloring_page_color_references');
  assert.equal(longReferenceResult.record.notes, 'Long item ID');

  const gallery = complete(
    {
      itemId: 'asset:gallery',
      kind: 'asset',
      digest: digest('a'),
      parent: pageItem,
      metadata: { position: 0 },
    },
    [asset('gallery-photo', 'coloring-page-photo', 'photos')]
  );
  const galleryResult = await created(gallery, 'coloring_pages');
  assert.equal(galleryResult.record.id, pageResult.record.id);
  assert.equal(galleryResult.record.photos.length, 1);
  assert.ok(galleryResult.record.photos.includes(galleryResult.receipt.stored_filename));
  const latePhoto = complete(
    {
      itemId: 'asset:gallery-position-2',
      kind: 'asset',
      parent: pageItem,
      metadata: { position: 2 },
    },
    [asset('gallery-position-2', 'coloring-page-photo', 'photos')]
  );
  const lateResult = await created(latePhoto, 'coloring_pages');
  // Historical receipts remain after users remove the corresponding photos.
  // Push live receipts past the first query page before restoring another photo.
  for (let index = 1; index <= 100; index++) {
    expectStatus(
      await json(
        fetch(`${baseUrl}/api/collections/archive_restore_items/records`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            id: `0000000000${String(index).padStart(5, '0')}`,
            user: userId,
            backup_id: backupId,
            item_id: `asset:removed-photo-${index}`,
            item_kind: 'asset',
            item_digest: digest('a'),
            asset_position: index,
            state: 'complete',
            target_collection: 'coloring_pages',
            target_record_id: pageResult.record.id,
            target_field: 'photos',
            stored_filename: `removed_${index}.png`,
          }),
        })
      ),
      200
    );
  }
  const userPhotoForm = new FormData();
  userPhotoForm.append('photos+', new Blob([bytes], { type: 'image/png' }), 'user-first.png');
  userPhotoForm.append('photos+', new Blob([bytes], { type: 'image/png' }), 'user-second.png');
  const userAdded = expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/coloring_pages/records/${pageResult.record.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: userPhotoForm,
      })
    ),
    200
  );
  const userNames = userAdded.photos.filter(
    name =>
      ![galleryResult.receipt.stored_filename, lateResult.receipt.stored_filename].includes(name)
  );
  assert.equal(userNames.length, 2);
  const middlePhoto = complete(
    {
      itemId: 'asset:gallery-position-1',
      kind: 'asset',
      parent: pageItem,
      metadata: { position: 1 },
    },
    [asset('gallery-position-1', 'coloring-page-photo', 'photos')]
  );
  const middleResult = await created(middlePhoto, 'coloring_pages');
  assert.deepEqual(middleResult.record.photos, [
    galleryResult.receipt.stored_filename,
    middleResult.receipt.stored_filename,
    lateResult.receipt.stored_filename,
    ...userNames,
  ]);
  expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/coloring_pages/records/${pageResult.record.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ 'photos-': [galleryResult.receipt.stored_filename] }),
      })
    ),
    200
  );
  const lastPhoto = complete(
    {
      itemId: 'asset:gallery-position-3',
      kind: 'asset',
      parent: pageItem,
      metadata: { position: 3 },
    },
    [asset('gallery-position-3', 'coloring-page-photo', 'photos')]
  );
  const lastResult = await created(lastPhoto, 'coloring_pages');
  assert.deepEqual(lastResult.record.photos, [
    middleResult.receipt.stored_filename,
    lateResult.receipt.stored_filename,
    lastResult.receipt.stored_filename,
    ...userNames,
  ]);
  const selectedMain = expectStatus(
    await json(
      fetch(`${baseUrl}/api/coloring/pages/${pageResult.record.id}/main-photo`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: userNames[0] }),
      })
    ),
    200
  );
  assert.equal(selectedMain.photos[0], userNames[0]);
  const photoAfterMain = complete(
    {
      itemId: 'asset:gallery-after-main',
      kind: 'asset',
      parent: pageItem,
      metadata: { position: 4 },
    },
    [asset('gallery-after-main', 'coloring-page-photo', 'photos')]
  );
  const afterMainResult = await created(photoAfterMain, 'coloring_pages');
  assert.deepEqual(afterMainResult.record.photos, [
    ...selectedMain.photos,
    afterMainResult.receipt.stored_filename,
  ]);

  const swatch = complete(
    {
      itemId: 'asset:swatch',
      kind: 'asset',
      digest: digest('b'),
      parent: pageItem,
      metadata: { position: 0, ownerItemId: reference.itemId },
    },
    [asset('swatch-photo', 'coloring-swatch-photo', 'photos')]
  );
  const swatchResult = await created(swatch, 'coloring_page_color_references');
  assert.equal(swatchResult.record.id, referenceResult.record.id);
  assert.equal(swatchResult.record.photos.length, 1);

  assert.equal(
    (await getRecord('projects', projectResult.record.id, outsider.headers)).response.status,
    404
  );
  assert.equal(
    (await list('archive_restore_items', `backup_id = "${backupId}"`, outsider.headers)).length,
    0
  );

  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const path = method === 'POST' ? '' : `/${projectResult.receipt.id}`;
    const attempt = await json(
      fetch(`${baseUrl}/api/collections/archive_restore_items/records${path}`, {
        method,
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body:
          method === 'DELETE'
            ? undefined
            : JSON.stringify({
                user: userId,
                backup_id: backupId,
                item_id: 'forged',
                item_kind: 'asset',
                item_digest: digest('c'),
                state: 'complete',
                target_collection: 'projects',
                target_record_id: projectResult.record.id,
              }),
      })
    );
    assert.equal(attempt.response.status, 403, `${method} receipt access must be locked`);
  }

  const altered = Buffer.from(bytes);
  altered[altered.length - 1] ^= 1;
  const digestBook = book('digest-retry');
  const digestPage = page('digest-retry', digestBook);
  const digestAsset = complete(
    {
      itemId: 'asset:digest-retry',
      kind: 'asset',
      digest: digest('d'),
      parent: digestPage,
      metadata: { position: 0 },
    },
    [asset('digest-retry-photo', 'coloring-page-photo', 'photos')]
  );
  const rejected = await restore(digestAsset, { fileBytes: altered });
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.data?.reason?.code, 'archive_asset_digest_mismatch');
  assert.equal(
    (await list('archive_restore_items', `item_id = "${digestAsset.itemId}"`)).length,
    0
  );
  assert.equal(expectStatus(await restore(digestAsset), 200).outcome, 'created');

  const untampered = complete(project('digest-metadata'));
  const tampered = { ...untampered, metadata: { ...untampered.metadata, title: 'Changed title' } };
  assert.equal((await restore(tampered)).response.status, 400);
  assert.equal((await list('archive_restore_items', `item_id = "${untampered.itemId}"`)).length, 0);
  assert.equal((await created(untampered, 'projects')).record.title, 'Project digest-metadata');

  const maliciousTags = complete(project('malicious-tags', { tags: { length: 4294967295 } }));
  assert.equal((await restore(maliciousTags)).response.status, 400);
  for (const kind of ['diamond-project', 'coloring-book', 'coloring-medium']) {
    const root =
      kind === 'diamond-project'
        ? project(`root-parent-${kind}`)
        : kind === 'coloring-book'
          ? book(`root-parent-${kind}`)
          : complete({
              itemId: `coloring-medium:root-parent`,
              kind,
              metadata: { name: 'Medium', type: 'colored_pencil' },
            });
    const withParent = complete({ ...root, parent: book('unexpected-parent') });
    assert.equal((await restore(withParent)).response.status, 400);
    assert.equal((await list('archive_restore_items', `item_id = "${root.itemId}"`)).length, 0);
  }
  for (const key of ['constructor', 'toString']) {
    const malformed = complete(project(`inherited-${key}`, { [key]: 'invalid' }));
    assert.equal((await restore(malformed)).response.status, 400);
  }
  const maliciousMediumIds = complete(
    page('malicious-mediums', book('malicious-mediums'), { mediumItemIds: { length: 4294967295 } })
  );
  assert.equal((await restore(maliciousMediumIds)).response.status, 400);

  const inventoryProject = complete(project('upload-inventory'), [
    asset('upload-inventory-cover', 'project-cover', 'image'),
  ]);
  assert.equal(
    (await restore(inventoryProject, { extraFiles: [{ field: 'unexpected', bytes }] })).response
      .status,
    400
  );
  assert.equal(
    (
      await restore(inventoryProject, {
        extraFiles: [{ field: 'asset:upload-inventory-cover', bytes }],
      })
    ).response.status,
    400
  );
  assert.equal(
    (await restore(inventoryProject, { missingFiles: ['upload-inventory-cover'] })).response.status,
    400
  );
  const oversizedDescriptor = complete(project('oversized-cover'), [
    { ...asset('oversized-cover', 'project-cover', 'image'), byteLength: 10485761 },
  ]);
  assert.equal((await restore(oversizedDescriptor)).response.status, 400);
  assert.equal(
    (await list('archive_restore_items', `item_id = "${inventoryProject.itemId}"`)).length,
    0
  );
  await created(inventoryProject, 'projects');

  const concurrentBook = book('concurrent');
  const concurrentPage = page('concurrent', concurrentBook);
  const concurrentAsset = complete(
    {
      itemId: 'asset:concurrent',
      kind: 'asset',
      digest: digest('e'),
      parent: concurrentPage,
      metadata: { position: 0 },
    },
    [asset('concurrent-photo', 'coloring-page-photo', 'photos')]
  );
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => restore(concurrentAsset)));
  assert.ok(concurrent.every(result => result.response.status === 200));
  assert.equal(concurrent.filter(result => result.body.outcome === 'created').length, 1);
  assert.equal(concurrent.filter(result => result.body.outcome === 'already_applied').length, 7);
  const concurrentRecord = expectStatus(
    await getRecord('coloring_pages', concurrent[0].body.targetRecordId),
    200
  );
  assert.equal(concurrentRecord.photos.length, 1);
  assert.equal(
    (await list('archive_restore_items', `item_id = "${concurrentAsset.itemId}"`)).length,
    1
  );

  assert.equal(expectStatus(await restore(mediumItem), 200).outcome, 'already_applied');
  assert.equal(expectStatus(await restore(projectItem), 200).outcome, 'already_applied');
  assert.equal(expectStatus(await restore(bookItem), 200).outcome, 'already_applied');
  assert.equal((await list('coloring_mediums', `user = "${userId}"`)).length, 1);
  assert.equal((await list('project_tags', `project = "${projectResult.record.id}"`)).length, 2);
  assert.equal((await list('coloring_book_tags', `book = "${bookResult.record.id}"`)).length, 2);
  assert.equal((await list('coloring_pages', `book = "${bookResult.record.id}"`)).length, 1);

  const childParent = project('child-first', { title: 'Original archive title' });
  const childNote = complete({
    itemId: 'diamond-project-note:child-first',
    kind: 'diamond-project-note',
    digest: digest('f'),
    parent: childParent,
    metadata: { content: 'Child arrived first', date: '2026-09-22' },
  });
  const childResult = await created(childNote, 'progress_notes');
  assert.equal(childResult.body.scaffoldedParentCount, 1);
  const scaffold = await receipt(childParent.itemId);
  assert.equal(scaffold.state, 'scaffold');
  expectStatus(
    await json(
      fetch(`${baseUrl}/api/collections/projects/records/${scaffold.target_record_id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Legitimate user edit' }),
      })
    ),
    200
  );
  const laterCover = complete(childParent, [asset('child-first-cover', 'project-cover', 'image')]);
  assert.equal(expectStatus(await restore(laterCover), 200).outcome, 'created');
  const preserved = expectStatus(await getRecord('projects', scaffold.target_record_id), 200);
  assert.equal(preserved.title, 'Legitimate user edit');
  assert.ok(preserved.image);
  assert.equal((await receipt(childParent.itemId)).state, 'complete');

  for (const [parent, child, collection, field, role] of [
    [
      project('edited-project-cover'),
      {
        itemId: 'diamond-project-note:edited-project-cover',
        kind: 'diamond-project-note',
        metadata: { content: 'Creates project scaffold', date: '2026-09-22' },
      },
      'projects',
      'image',
      'project-cover',
    ],
    [
      book('edited-book-cover'),
      {
        itemId: 'coloring-page:edited-book-cover',
        kind: 'coloring-page',
        metadata: { pageNumber: 1, status: 'in_progress', mediumItemIds: [] },
      },
      'coloring_books',
      'cover_image',
      'coloring-book-cover',
    ],
  ]) {
    await created(
      complete({ ...child, parent }),
      child.kind === 'diamond-project-note' ? 'progress_notes' : 'coloring_pages'
    );
    const parentReceipt = await receipt(parent.itemId);
    assert.equal(parentReceipt.state, 'scaffold');
    const userCover = new FormData();
    userCover.set(field, new Blob([bytes], { type: 'image/png' }), 'user-cover.png');
    const edited = expectStatus(
      await json(
        fetch(
          `${baseUrl}/api/collections/${collection}/records/${parentReceipt.target_record_id}`,
          { method: 'PATCH', headers: authHeaders, body: userCover }
        )
      ),
      200
    );
    assert.ok(edited[field], `user cover must be attached to ${collection} scaffold`);
    const parentWithCover = complete(parent, [asset(`${collection}-later-cover`, role, field)]);
    const conflict = await restore(parentWithCover);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.data?.reason?.code, 'archive_target_file_conflict');
    const afterConflict = expectStatus(
      await getRecord(collection, parentReceipt.target_record_id),
      200
    );
    assert.equal(afterConflict[field], edited[field], 'user cover must survive rejected restore');
    assert.equal((await receipt(parent.itemId)).state, 'scaffold');
  }

  const completeDelete = complete(project('complete-delete'));
  const completeDeleteResult = await created(completeDelete, 'projects');
  const removedComplete = await fetch(
    `${baseUrl}/api/collections/projects/records/${completeDeleteResult.record.id}`,
    { method: 'DELETE', headers: adminHeaders }
  );
  assert.equal(removedComplete.status, 204, await removedComplete.text());
  const completeConflict = await restore(completeDelete);
  assert.equal(completeConflict.response.status, 409);
  assert.equal(completeConflict.body.data?.reason?.code, 'archive_target_deleted');

  const scaffoldParent = project('scaffold-delete');
  await created(
    complete({
      itemId: 'diamond-project-note:scaffold-delete',
      kind: 'diamond-project-note',
      digest: digest('a'),
      parent: scaffoldParent,
      metadata: { content: 'Creates scaffold', date: '2026-09-22' },
    }),
    'progress_notes'
  );
  const deletedScaffoldReceipt = await receipt(scaffoldParent.itemId);
  const removedScaffold = await fetch(
    `${baseUrl}/api/collections/projects/records/${deletedScaffoldReceipt.target_record_id}`,
    { method: 'DELETE', headers: adminHeaders }
  );
  assert.equal(removedScaffold.status, 204, await removedScaffold.text());
  const scaffoldConflict = await restore(complete(scaffoldParent));
  assert.equal(scaffoldConflict.response.status, 409);
  assert.equal(scaffoldConflict.body.data?.reason?.code, 'archive_target_deleted');

  const rollbackBook = book('rollback-new-file', { tags: ['Rollback taxonomy'] });
  const rollbackPage = page('rollback-new-file', rollbackBook);
  const rollbackNew = complete(
    {
      itemId: 'asset:rollback-new-file',
      kind: 'asset',
      digest: digest('b'),
      parent: rollbackPage,
      metadata: { position: 0 },
    },
    [asset('rollback-new-file', 'coloring-page-photo', 'photos')]
  );
  assert.equal((await restore(rollbackNew)).response.status, 400);
  for (const itemId of [rollbackBook.itemId, rollbackPage.itemId, rollbackNew.itemId])
    assert.equal((await list('archive_restore_items', `item_id = "${itemId}"`)).length, 0);
  assert.equal(
    (await list('coloring_books', `user = "${userId}" && title = "Book rollback-new-file"`)).length,
    0
  );

  const beforeRollback = expectStatus(await getRecord('coloring_pages', pageResult.record.id), 200);
  assert.equal(
    (await list('coloring_tags', `user = "${userId}" && name = "Rollback taxonomy"`)).length,
    0,
    'failed receipt writes must roll back prefetched taxonomy writes too'
  );

  const rollbackGallery = complete(
    {
      itemId: 'asset:rollback-gallery',
      kind: 'asset',
      digest: digest('c'),
      parent: pageItem,
      metadata: { position: 1 },
    },
    [asset('rollback-gallery', 'coloring-page-photo', 'photos')]
  );
  assert.equal((await restore(rollbackGallery)).response.status, 400);
  assert.equal(
    (await list('archive_restore_items', `item_id = "${rollbackGallery.itemId}"`)).length,
    0
  );
  const afterRollback = expectStatus(await getRecord('coloring_pages', pageResult.record.id), 200);
  assert.deepEqual(afterRollback.photos, beforeRollback.photos);
} finally {
  for (const id of createdUserIds.reverse()) {
    const removed = await fetch(`${baseUrl}/api/collections/users/records/${id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert.equal(removed.status, 204, await removed.text());
  }
  if (userId)
    assert.equal(
      (await list('archive_restore_items', `user = "${userId}"`)).length,
      0,
      'test receipts must cascade with the test user'
    );
}

console.log('archive restore v3 endpoint checks passed');
