import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
mkdirSync('.tmp', { recursive: true });
const directory = mkdtempSync(path.join(root, '.tmp/color-reference-test-'));
const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const dataDir = path.join(directory, 'pb_data');
const adminEmail = 'color-reference-admin@localhost.test';
const password = 'color-reference-fixture-password';
const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], {
  encoding: 'utf8',
});
assert.equal(setup.status, 0, setup.stderr);
const processHandle = spawn(
  binary,
  [
    'serve',
    `--http=127.0.0.1:${port}`,
    `--dir=${dataDir}`,
    `--hooksDir=${path.join(root, 'pb_hooks')}`,
    `--migrationsDir=${path.join(directory, 'migrations')}`,
  ],
  { stdio: 'ignore' }
);
let stopping = false;
const stopPocketBase = async ({ forceAfterMs = 5_000 } = {}) => {
  if (stopping) return;
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode) return;
  stopping = true;
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null && processHandle.signalCode === null) {
        try {
          processHandle.kill('SIGKILL');
        } catch {
          // Process may already be gone.
        }
      }
      resolve();
    }, forceAfterMs);
    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    try {
      processHandle.kill('SIGTERM');
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
};
const exitAfterStop = signal => {
  void stopPocketBase({ forceAfterMs: 2_000 }).finally(() => {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => exitAfterStop(signal));
}
process.on('exit', () => {
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    try {
      processHandle.kill('SIGKILL');
    } catch {
      // Process may already be gone.
    }
  }
});
const admin = new PocketBase(url);
let count = 0;
async function check(name, callback) {
  await callback();
  count++;
  console.log(`ok ${count} - ${name}`);
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
const photo = () => new File([png], 'swatch.png', { type: 'image/png' });
const collection = 'coloring_page_color_references';
try {
  for (let attempts = 0; ; attempts++) {
    try {
      await admin.health.check();
      break;
    } catch {
      if (attempts > 100) throw new Error('PocketBase did not start');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  await admin.collections.import(
    JSON.parse(readFileSync('docs/pocketbase/collections.schema.json', 'utf8')),
    false
  );
  const user = await admin.collection('users').create({
    email: 'owner@localhost.test',
    username: 'fixture-owner',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const stranger = await admin.collection('users').create({
    email: 'stranger@localhost.test',
    username: 'fixture-stranger',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const owner = new PocketBase(url);
  owner.autoCancellation(false);
  const other = new PocketBase(url);
  await owner.collection('users').authWithPassword(user.email, password);
  await other.collection('users').authWithPassword(stranger.email, password);
  const book = await admin.collection('coloring_books').create({
    title: 'Color reference fixture',
    user: user.id,
    total_pages: 3,
    status: 'in_progress',
  });
  const pages = await admin
    .collection('coloring_pages')
    .getFullList({ filter: `book = '${book.id}'`, sort: 'page_number' });
  assert.equal(pages.length, 3);
  const page = pages[2];
  const save = async (client, pageId, action, values = {}, files = []) => {
    const body = new FormData();
    body.set('action', action);
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    for (const file of files) body.append('photos', file);
    return client.send(`/api/coloring/pages/${pageId}/color-reference`, { method: 'POST', body });
  };
  let reference;
  await check('concurrent first saves create one reference and preserve both sheets', async () => {
    await Promise.all(
      ['first-a', 'first-b'].map(requestId =>
        save(owner, page.id, 'photos', { requestId }, [photo()])
      )
    );
    const records = await owner.collection(collection).getFullList();
    assert.equal(records.length, 1);
    reference = records[0];
    assert.equal(reference.photos.length, 2);
  });
  await check('retrying the same upload does not duplicate its files', async () => {
    const result = await save(owner, page.id, 'photos', { requestId: 'first-a' }, [photo()]);
    assert.equal(result.reference.photos.length, 2);
  });
  const notes = '  001  BR 709\r\n  RY 08 + #  ';
  await check('notes preserve codes, spacing and line breaks alongside photos', async () => {
    reference = (await save(owner, page.id, 'notes', { notes, baselineNotes: '' })).reference;
    assert.equal(reference.notes, notes);
    assert.equal(reference.photos.length, 2);
    await assert.rejects(
      save(owner, page.id, 'notes', { notes: 'stale', baselineNotes: '' }),
      error => error.status === 409
    );
  });
  await check(
    'ownership rules protect reads, writes, reassignments, originals and thumbnails',
    async () => {
      assert.equal((await other.collection(collection).getFullList()).length, 0);
      await assert.rejects(
        save(other, page.id, 'notes', { notes: 'wrong', baselineNotes: notes }),
        error => error.status === 403
      );
      await assert.rejects(
        owner.collection(collection).update(reference.id, { user: stranger.id }),
        error => error.status === 403
      );
      await assert.rejects(
        owner.collection(collection).update(reference.id, { page: pages[0].id }),
        error => error.status === 403
      );
      await assert.rejects(
        owner.collection(collection).create({ page: page.id, user: user.id, notes: 'duplicate' })
      );
      await assert.rejects(
        admin.collection(collection).create({ page: page.id, user: user.id, notes: 'duplicate' })
      );
      const ownToken = await owner.files.getToken();
      const otherToken = await other.files.getToken();
      for (const thumb of ['', '320x320f']) {
        assert.equal(
          (
            await fetch(
              owner.files.getURL(reference, reference.photos[0], { thumb, token: ownToken })
            )
          ).status,
          200
        );
        assert.equal(
          (await fetch(owner.files.getURL(reference, reference.photos[0], { thumb }))).status,
          404
        );
        assert.equal(
          (
            await fetch(
              owner.files.getURL(reference, reference.photos[0], { thumb, token: otherToken })
            )
          ).status,
          404
        );
      }
    }
  );
  await check('invalid batches save no photos and remain retryable', async () => {
    await assert.rejects(
      save(owner, page.id, 'photos', { requestId: 'failed' }, [
        photo(),
        new File(['bad'], 'invalid.txt', { type: 'text/plain' }),
      ])
    );
    assert.equal((await owner.collection(collection).getOne(reference.id)).photos.length, 2);
    reference = (await save(owner, page.id, 'photos', { requestId: 'failed' }, [photo()]))
      .reference;
    assert.equal(reference.photos.length, 3);
  });
  await check('photo and notes mutations do not touch page metadata or progress', async () => {
    assert.deepEqual(await admin.collection('coloring_pages').getOne(page.id), page);
    assert.equal(
      (
        await admin
          .collection('coloring_page_progress_notes')
          .getFullList({ filter: `page = '${page.id}'` })
      ).length,
      0
    );
  });
  const reduce = () =>
    owner.send(`/api/coloring/books/${book.id}/reduce-pages`, {
      method: 'POST',
      body: { targetTotalPages: 2 },
    });
  await check('both page reduction paths protect photo-only pages', async () => {
    reference = (await save(owner, page.id, 'notes', { notes: '', baselineNotes: notes }))
      .reference;
    assert.equal(reference.photos.length, 3);
    await assert.rejects(reduce(), error => error.status === 400);
    await assert.rejects(
      owner.collection('coloring_books').update(book.id, { total_pages: 2 }),
      error => error.status === 400
    );
  });
  await check('individual deletion preserves remaining photos and notes', async () => {
    reference = (await save(owner, page.id, 'notes', { notes: '001', baselineNotes: '' }))
      .reference;
    reference = (await save(owner, page.id, 'remove', { filename: reference.photos[0] })).reference;
    assert.equal(reference.photos.length, 2);
    assert.equal(reference.notes, '001');
    for (const filename of reference.photos)
      reference = (await save(owner, page.id, 'remove', { filename })).reference;
    assert.equal(reference.photos.length, 0);
    assert.equal(reference.notes, '001');
  });
  await check('both page reduction paths protect notes-only pages', async () => {
    await assert.rejects(reduce(), error => error.status === 400);
    await assert.rejects(
      owner.collection('coloring_books').update(book.id, { total_pages: 2 }),
      error => error.status === 400
    );
  });
  await check(
    'clearing the final note removes the empty reference and permits reduction',
    async () => {
      assert.equal(
        (await save(owner, page.id, 'notes', { notes: '  \n ', baselineNotes: '001' })).reference,
        null
      );
      assert.equal((await owner.collection(collection).getFullList()).length, 0);
      await reduce();
      await assert.rejects(
        save(owner, page.id, 'photos', { requestId: 'deleted-page' }, [photo()]),
        error => error.status === 404
      );
    }
  );
  await check('adding photos to a notes-only reference preserves its text', async () => {
    await save(owner, pages[1].id, 'notes', { notes: '007', baselineNotes: '' });
    const result = await save(owner, pages[1].id, 'photos', { requestId: 'notes-first' }, [
      photo(),
    ]);
    assert.equal(result.reference.notes, '007');
    assert.equal(result.reference.photos.length, 1);
  });
  await check(
    'archive restores are atomic, retryable and never overwrite another reference',
    async () => {
      reference = (
        await save(owner, pages[0].id, 'restore', { notes, restoreKey: 'archive:page' }, [photo()])
      ).reference;
      reference = (
        await save(
          owner,
          pages[0].id,
          'restore',
          { notes, restoreKey: 'archive:page', restoreOffset: 1 },
          [photo()]
        )
      ).reference;
      assert.equal(reference.photos.length, 2);
      assert.equal(reference.notes, notes);
      assert.equal(
        (
          await save(owner, pages[0].id, 'restore', { notes, restoreKey: 'archive:page' }, [
            photo(),
          ])
        ).reference.id,
        reference.id
      );
      await assert.rejects(
        save(owner, pages[0].id, 'restore', { notes: 'wrong', restoreKey: 'different:page' }, [
          photo(),
        ]),
        error => error.status === 409
      );
    }
  );
  await check('removing a restored sheet lets its restore offset re-upload on retry', async () => {
    const target = pages[0].id;
    const before = await owner.collection(collection).getOne(reference.id);
    assert.equal(before.photos.length, 2);
    const [offsetZeroFilename, offsetOneFilename] = before.photos;
    reference = (await save(owner, target, 'remove', { filename: offsetZeroFilename })).reference;
    assert.equal(reference.photos.length, 1);
    assert.deepEqual(reference.photos, [offsetOneFilename]);
    reference = (
      await save(owner, target, 'restore', { notes, restoreKey: 'archive:page' }, [photo()])
    ).reference;
    assert.equal(reference.photos.length, 2);
    assert.equal(reference.photos.indexOf(offsetZeroFilename), -1);
    // The untouched offset 1 continuation survives the offset 0 recovery.
    assert.notEqual(reference.photos.indexOf(offsetOneFilename), -1);
  });
  await check('legacy bare restore receipts stay valid until their photo is removed', async () => {
    const legacyBook = await admin.collection('coloring_books').create({
      title: 'Legacy restore receipt fixture',
      user: user.id,
      total_pages: 1,
      status: 'in_progress',
    });
    const legacyPage = (
      await admin.collection('coloring_pages').getFullList({ filter: `book = '${legacyBook.id}'` })
    )[0];
    let legacyReference = (
      await save(owner, legacyPage.id, 'restore', { notes: 'legacy', restoreKey: 'legacy:page' }, [
        photo(),
      ])
    ).reference;
    assert.equal(legacyReference.photos.length, 1);
    // Simulate a pre-fix receipt that only recorded the offset, not the filename.
    await admin
      .collection(collection)
      .update(legacyReference.id, { upload_receipts: JSON.stringify(['restore:0']) });
    const retried = (
      await save(owner, legacyPage.id, 'restore', { notes: 'legacy', restoreKey: 'legacy:page' }, [
        photo(),
      ])
    ).reference;
    assert.equal(retried.id, legacyReference.id);
    assert.equal(retried.photos.length, 1);
    await save(owner, legacyPage.id, 'remove', { filename: retried.photos[0] });
    const afterRemoval = await admin.collection(collection).getOne(legacyReference.id);
    assert.equal(afterRemoval.photos.length, 0);
    assert.deepEqual(afterRemoval.upload_receipts, []);
    const restoredAgain = (
      await save(owner, legacyPage.id, 'restore', { notes: 'legacy', restoreKey: 'legacy:page' }, [
        photo(),
      ])
    ).reference;
    assert.equal(restoredAgain.photos.length, 1);
    await admin.collection('coloring_books').delete(legacyBook.id);
  });
  await check(
    'legacy receipt recovery restores the removed sheet without duplicating its neighbor',
    async () => {
      const fixtureBook = await admin.collection('coloring_books').create({
        title: 'Legacy multi-sheet recovery',
        user: user.id,
        total_pages: 1,
        status: 'in_progress',
      });
      const fixturePage = (
        await admin
          .collection('coloring_pages')
          .getFullList({ filter: `book = '${fixtureBook.id}'` })
      )[0];
      const values = { notes: 'Archived notes', restoreKey: 'legacy-multiple' };
      let result = await save(owner, fixturePage.id, 'restore', values, [photo()]);
      result = await save(owner, fixturePage.id, 'restore', { ...values, restoreOffset: 1 }, [
        photo(),
      ]);
      const [first, second] = result.reference.photos;
      await admin.collection(collection).update(result.reference.id, {
        upload_receipts: JSON.stringify(['restore:0', 'restore:1']),
      });
      await save(owner, fixturePage.id, 'remove', { filename: first });
      const recovered = await save(owner, fixturePage.id, 'restore', values, [photo()]);
      assert.equal(recovered.reference.photos.length, 2);
      assert.equal(recovered.addedPhotoCount, 1);
      assert.ok(recovered.reference.photos.includes(second));
      const retry = await save(owner, fixturePage.id, 'restore', { ...values, restoreOffset: 1 }, [
        photo(),
      ]);
      assert.deepEqual(retry.reference.photos, recovered.reference.photos);
      assert.equal(retry.addedPhotoCount, 0);
      await admin.collection('coloring_books').delete(fixtureBook.id);
    }
  );
  await check('restoring a removed first sheet preserves deliberately cleared notes', async () => {
    const fixtureBook = await admin.collection('coloring_books').create({
      title: 'Cleared restore notes',
      user: user.id,
      total_pages: 1,
      status: 'in_progress',
    });
    const fixturePage = (
      await admin.collection('coloring_pages').getFullList({ filter: `book = '${fixtureBook.id}'` })
    )[0];
    const values = { notes: 'Archived notes', restoreKey: 'cleared-notes' };
    await save(owner, fixturePage.id, 'restore', values, [photo()]);
    const initial = await save(owner, fixturePage.id, 'restore', { ...values, restoreOffset: 1 }, [
      photo(),
    ]);
    await save(owner, fixturePage.id, 'notes', { notes: '', baselineNotes: values.notes });
    await save(owner, fixturePage.id, 'remove', { filename: initial.reference.photos[0] });
    const recovered = await save(owner, fixturePage.id, 'restore', values, [photo()]);
    assert.equal(recovered.reference.notes, '');
    assert.equal(recovered.reference.photos.length, 2);
    assert.equal(recovered.addedPhotoCount, 1);
    await admin.collection('coloring_books').delete(fixtureBook.id);
  });
  await check('a restore continuation cannot recreate a removed reference', async () => {
    const target = pages[1].id;
    const existing = await owner.collection(collection).getFirstListItem(`page = '${target}'`);
    for (const filename of existing.photos) await save(owner, target, 'remove', { filename });
    await save(owner, target, 'notes', { notes: '', baselineNotes: existing.notes });
    await assert.rejects(
      save(owner, target, 'restore', { restoreKey: 'missing', restoreOffset: 1 }, [photo()]),
      error => error.status === 409
    );
    assert.equal(
      (await owner.collection(collection).getFullList({ filter: `page = '${target}'` })).length,
      0
    );
  });
  await check('notes-only archive restore accepts no photo part and retries safely', async () => {
    const target = pages[1].id;
    const values = { notes, restoreKey: 'notes-only-archive' };
    const restored = (await save(owner, target, 'restore', values)).reference;
    assert.equal(restored.notes, notes);
    assert.deepEqual(restored.photos, []);
    const retried = (await save(owner, target, 'restore', values)).reference;
    assert.equal(retried.id, restored.id);
    assert.equal(retried.notes, notes);
    await assert.rejects(
      save(owner, target, 'photos', { requestId: 'empty-upload' }),
      error => error.status === 400
    );
  });
  await check('book deletion cascades through references and files', async () => {
    const filePath = path.join(
      dataDir,
      'storage',
      reference.collectionId,
      reference.id,
      reference.photos[0]
    );
    assert.ok(existsSync(filePath));
    await admin.collection('coloring_books').delete(book.id);
    assert.equal((await admin.collection(collection).getFullList()).length, 0);
    assert.equal(existsSync(filePath), false);
  });
  await check('account deletion cascades through references and files', async () => {
    const book2 = await admin
      .collection('coloring_books')
      .create({ title: 'Account fixture', user: user.id, total_pages: 1, status: 'in_progress' });
    const page2 = (
      await admin.collection('coloring_pages').getFullList({ filter: `book = '${book2.id}'` })
    )[0];
    reference = (await save(owner, page2.id, 'photos', { requestId: 'account' }, [photo()]))
      .reference;
    const filePath = path.join(
      dataDir,
      'storage',
      reference.collectionId,
      reference.id,
      reference.photos[0]
    );
    assert.ok(existsSync(filePath));
    await admin.collection('users').delete(user.id);
    assert.equal((await admin.collection(collection).getFullList()).length, 0);
    assert.equal(existsSync(filePath), false);
  });
  console.log(`Passed ${count} disposable PocketBase checks.`);
} finally {
  await stopPocketBase();
}
