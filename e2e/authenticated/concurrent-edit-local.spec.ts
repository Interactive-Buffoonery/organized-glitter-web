import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const expectedRevisionHeader = 'X-OG-Expected-Revision';

test.describe('concurrent full-form edits', () => {
  test.use({ serviceWorkers: 'block' });

  let pb: PocketBase;
  let userId: string;
  const created: Array<{ collection: 'projects' | 'coloring_books'; id: string }> = [];
  const sql = (statement: string) => {
    const storageState = process.env.E2E_STORAGE_STATE;
    if (!storageState) throw new Error('Missing disposable QA storage path.');
    const dataFile = path.resolve(path.dirname(storageState), '../pocketbase/pb_data/data.db');
    const database = new DatabaseSync(dataFile);
    try {
      if (statement.trimStart().startsWith('SELECT')) {
        const row = database.prepare(statement).get();
        return String(Object.values(row ?? {})[0] ?? '');
      }
      database.exec(statement);
      return '';
    } finally {
      database.close();
    }
  };

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Concurrent edit' });
    if (!email || !password) throw new Error('Missing disposable QA credentials.');
    pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    userId = pb.authStore.record?.id ?? '';
    if (!userId) throw new Error('Disposable QA user is unavailable.');
  });

  test.afterEach(async () => {
    for (const record of created.splice(0)) {
      await pb.collection(record.collection).delete(record.id);
    }
  });

  const createProject = async () => {
    const record = await pb.collection('projects').create({
      user: userId,
      title: `Concurrent project ${randomUUID()}`,
      status: 'wishlist',
      kit_category: 'full',
      revision: 999,
    });
    created.push({ collection: 'projects', id: record.id });
    return record;
  };

  const createBook = async () => {
    const record = await pb.collection('coloring_books').create({
      user: userId,
      title: `Concurrent book ${randomUUID()}`,
      status: 'purchased',
      total_pages: 2,
      is_mystery: false,
      revision: 999,
    });
    created.push({ collection: 'coloring_books', id: record.id });
    return record;
  };

  test('increments revisions for header-free writes and rejects simultaneous stale writes', async () => {
    for (const initial of [await createProject(), await createBook()]) {
      const collection = initial.collectionName;
      expect(initial.revision).toBe(0);
      const trigger = `freeze_updated_${collection}`;
      const frozenUpdated = '2026-09-28 12:00:00.000Z';
      sql(`
        CREATE TRIGGER ${trigger} AFTER UPDATE ON ${collection}
        WHEN NEW.id = '${initial.id}'
        BEGIN UPDATE ${collection} SET updated = '${frozenUpdated}' WHERE id = NEW.id; END;
      `);
      try {
        const nativeWrite = await pb.collection(collection).update(initial.id, {
          title: `${initial.title} native`,
          revision: 500,
        });
        expect(nativeWrite.revision).toBe(1);
        const beforeConcurrent = await pb.collection(collection).getOne(initial.id);
        expect(beforeConcurrent.updated).toBe(frozenUpdated);

        const attempts = await Promise.allSettled(
          ['first', 'second'].map(title =>
            pb.collection(collection).update(
              initial.id,
              { title, revision: 500 },
              {
                headers: { [expectedRevisionHeader]: '1' },
                requestKey: null,
              }
            )
          )
        );
        expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
        const accepted = attempts.find(result => result.status === 'fulfilled');
        const rejected = attempts.find(result => result.status === 'rejected');
        expect(accepted?.status === 'fulfilled' && accepted.value.revision).toBe(2);
        expect(
          rejected?.status === 'rejected' && (rejected.reason as { status: number }).status
        ).toBe(409);

        const persisted = await pb.collection(collection).getOne(initial.id);
        expect(persisted.revision).toBe(2);
        expect(persisted.updated).toBe(beforeConcurrent.updated);
        expect(persisted.title).toBe(accepted?.status === 'fulfilled' && accepted.value.title);

        if (collection === 'coloring_books') {
          await pb.send(`/api/coloring/books/${initial.id}/reduce-pages`, {
            method: 'POST',
            body: { targetTotalPages: 1 },
          });
          expect((await pb.collection(collection).getOne(initial.id)).revision).toBe(3);
        }

        sql(`UPDATE ${collection} SET revision = 9007199254740991 WHERE id = '${initial.id}';`);
        await expect(
          pb.collection(collection).update(initial.id, { title: 'Overflowed' })
        ).rejects.toMatchObject({
          status: 409,
        });
        expect((await pb.collection(collection).getOne(initial.id)).revision).toBe(
          Number.MAX_SAFE_INTEGER
        );
      } finally {
        sql(`DROP TRIGGER IF EXISTS ${trigger};`);
      }
    }
  });

  test('bounds direct reduction before writes and rolls back a late supported deletion', async ({
    page,
  }) => {
    const book = await pb.collection('coloring_books').create({
      user: userId,
      title: `Legacy oversized book ${randomUUID()}`,
      status: 'purchased',
      total_pages: 1,
      is_mystery: false,
    });
    created.push({ collection: 'coloring_books', id: book.id });

    sql(`
      UPDATE coloring_books SET total_pages = 502 WHERE id = '${book.id}';
      WITH RECURSIVE numbers(page_number) AS (
        SELECT 2 UNION ALL SELECT page_number + 1 FROM numbers WHERE page_number < 502
      )
      INSERT INTO coloring_pages (book, page_number, status)
      SELECT '${book.id}', page_number, 'not_started' FROM numbers;
    `);
    expect(
      Number(
        sql(`SELECT COUNT(*) FROM coloring_pages WHERE book = '${book.id}' AND page_number > 2;`)
      )
    ).toBe(500);
    const overLimit = await pb
      .collection('coloring_books')
      .update(book.id, { total_pages: 1 }, { headers: { [expectedRevisionHeader]: '0' } })
      .catch(error => error);
    expect(overLimit).toMatchObject({ status: 400 });
    expect(overLimit.response.data.total_pages.message).toBe(
      'Reduce this coloring book in steps of 500 pages or fewer.'
    );
    await page.goto(`/coloring/${book.id}/edit`);
    await page.getByRole('spinbutton', { name: 'Number of pages' }).fill('1');
    await page.getByRole('button', { name: 'Update book' }).click();
    await expect(
      page.getByText('Reduce this coloring book in steps of 500 pages or fewer.')
    ).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Number of pages' })).toHaveValue('1');
    expect(await pb.collection('coloring_books').getOne(book.id)).toMatchObject({
      total_pages: 502,
      revision: 0,
    });
    expect(Number(sql(`SELECT COUNT(*) FROM coloring_pages WHERE book = '${book.id}';`))).toBe(502);

    sql(`
      CREATE TRIGGER fail_later_reduction_chunk
      BEFORE DELETE ON coloring_pages
      WHEN OLD.book = '${book.id}' AND OLD.page_number = 3
      BEGIN SELECT RAISE(ABORT, 'later chunk failure'); END;
    `);
    expect(
      sql("SELECT sql FROM sqlite_master WHERE name = 'fail_later_reduction_chunk';")
    ).toContain('OLD.page_number = 3');

    try {
      const failure = await pb
        .collection('coloring_books')
        .update(book.id, { total_pages: 2 }, { headers: { [expectedRevisionHeader]: '0' } })
        .catch(error => error);
      expect(failure).toMatchObject({
        status: 400,
        response: { message: 'Failed to update record.' },
      });

      const persisted = await pb.collection('coloring_books').getOne(book.id);
      const pages = await pb.collection('coloring_pages').getFullList({
        filter: pb.filter('book = {:bookId}', { bookId: book.id }),
      });
      expect(persisted).toMatchObject({ total_pages: 502, revision: 0 });
      expect(pages).toHaveLength(502);
    } finally {
      sql('DROP TRIGGER IF EXISTS fail_later_reduction_chunk;');
    }

    const retry = await pb
      .collection('coloring_books')
      .update(book.id, { total_pages: 2 }, { headers: { [expectedRevisionHeader]: '0' } });
    const remainingPages = await pb.collection('coloring_pages').getFullList({
      filter: pb.filter('book = {:bookId}', { bookId: book.id }),
    });
    expect(retry).toMatchObject({ total_pages: 2, revision: 1 });
    expect(remainingPages).toHaveLength(2);
  });

  test('atomically saves JSON and multipart tag edits with one winning revision', async () => {
    for (const collection of ['projects', 'coloring_books'] as const) {
      const parent = collection === 'projects' ? await createProject() : await createBook();
      const tagCollection = collection === 'projects' ? 'tags' : 'coloring_tags';
      const joinCollection = collection === 'projects' ? 'project_tags' : 'coloring_book_tags';
      const relation = collection === 'projects' ? 'project' : 'book';
      const tags = await Promise.all(
        ['first', 'second'].map(name =>
          pb.collection(tagCollection).create(
            {
              user: userId,
              name: `${name}-${randomUUID()}`,
              slug: `${name}-${randomUUID()}`,
              color: '#14b8a6',
            },
            { requestKey: null }
          )
        )
      );
      try {
        const attempts = await Promise.allSettled(
          tags.map((tag, index) => {
            const payload =
              collection === 'projects'
                ? new FormData()
                : { title: `Tag editor ${index}`, og_tag_ids: JSON.stringify([tag.id]) };
            if (payload instanceof FormData) {
              payload.set('title', `Tag editor ${index}`);
              payload.set('og_tag_ids', JSON.stringify([tag.id]));
            }
            return pb.collection(collection).update(parent.id, payload, {
              headers: { [expectedRevisionHeader]: '0' },
              requestKey: null,
            });
          })
        );
        expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
        const winner = attempts.find(attempt => attempt.status === 'fulfilled');
        expect(winner?.status === 'fulfilled' && winner.value.revision).toBe(1);
        const joins = await pb.collection(joinCollection).getFullList({
          filter: pb.filter(`${relation} = {:parentId}`, { parentId: parent.id }),
        });
        expect(joins).toHaveLength(1);
        const winningIndex =
          winner?.status === 'fulfilled' && winner.value.title.endsWith('1') ? 1 : 0;
        expect(joins[0].tag).toBe(tags[winningIndex].id);
      } finally {
        await pb.collection(collection).delete(parent.id);
        created.splice(
          created.findIndex(record => record.id === parent.id),
          1
        );
        await Promise.all(
          tags.map(tag => pb.collection(tagCollection).delete(tag.id, { requestKey: null }))
        );
      }
    }
  });

  test('direct native join writes revise parents and stale full forms cannot revert tags', async () => {
    const project = await createProject();
    const book = await createBook();
    for (const [parent, tagCollection, joinCollection, relation] of [
      [project, 'tags', 'project_tags', 'project'],
      [book, 'coloring_tags', 'coloring_book_tags', 'book'],
    ] as const) {
      const tag = await pb.collection(tagCollection).create({
        user: userId,
        name: `Direct ${randomUUID()}`,
        slug: `direct-${randomUUID()}`,
        color: '#14b8a6',
      });
      try {
        const join = await pb
          .collection(joinCollection)
          .create({ [relation]: parent.id, tag: tag.id });
        expect((await pb.collection(parent.collectionName).getOne(parent.id)).revision).toBe(1);
        await expect(
          pb
            .collection(parent.collectionName)
            .update(
              parent.id,
              { title: 'stale', og_tag_ids: JSON.stringify([]) },
              { headers: { [expectedRevisionHeader]: '0' } }
            )
        ).rejects.toMatchObject({ status: 409 });
        expect(await pb.collection(joinCollection).getOne(join.id)).toMatchObject({ tag: tag.id });
        await pb.collection(joinCollection).delete(join.id);
        expect((await pb.collection(parent.collectionName).getOne(parent.id)).revision).toBe(2);
      } finally {
        await pb.collection(tagCollection).delete(tag.id);
      }
    }
  });

  test('moving a direct join revises both parents once and deleting a parent cascades', async () => {
    const first = await createBook();
    const second = await createBook();
    const tag = await pb.collection('coloring_tags').create({
      user: userId,
      name: `Move ${randomUUID()}`,
      slug: `move-${randomUUID()}`,
      color: '#14b8a6',
    });
    const join = await pb.collection('coloring_book_tags').create({ book: first.id, tag: tag.id });
    expect((await pb.collection('coloring_books').getOne(first.id)).revision).toBe(1);
    expect((await pb.collection('coloring_books').getOne(second.id)).revision).toBe(0);

    await pb.collection('coloring_book_tags').update(join.id, { book: second.id });
    expect((await pb.collection('coloring_books').getOne(first.id)).revision).toBe(2);
    expect((await pb.collection('coloring_books').getOne(second.id)).revision).toBe(1);

    await pb.collection('coloring_books').delete(second.id);
    created.splice(
      created.findIndex(record => record.id === second.id),
      1
    );
    expect(
      Number(sql(`SELECT COUNT(*) FROM coloring_book_tags WHERE book = '${second.id}';`))
    ).toBe(0);
    await pb.collection('coloring_tags').delete(tag.id);
  });

  test('recovering an unrelated form edit preserves a direct tag change', async ({ page }) => {
    for (const collection of ['projects', 'coloring_books'] as const) {
      const parent = collection === 'projects' ? await createProject() : await createBook();
      const tagCollection = collection === 'projects' ? 'tags' : 'coloring_tags';
      const joinCollection = collection === 'projects' ? 'project_tags' : 'coloring_book_tags';
      const relation = collection === 'projects' ? 'project' : 'book';
      const path = collection === 'projects' ? `/projects/${parent.id}` : `/coloring/${parent.id}`;
      const editName = collection === 'projects' ? 'Edit project' : 'Edit coloring book';
      await page.goto(path);
      await page.getByRole('button', { name: editName }).click();

      const tag = await pb.collection(tagCollection).create({
        user: userId,
        name: `Concurrent ${randomUUID()}`,
        slug: `concurrent-${randomUUID()}`,
        color: '#14b8a6',
      });
      const join = await pb
        .collection(joinCollection)
        .create({ [relation]: parent.id, tag: tag.id });
      await page
        .getByRole('textbox', { name: 'Source URL' })
        .fill('https://example.test/unrelated');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('alert')).toContainText('changed elsewhere');
      await page.getByRole('button', { name: 'Keep my edits for a new save' }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeFocused();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('dialog', { name: editName })).toHaveCount(0);

      expect((await pb.collection(parent.collectionName).getOne(parent.id)).revision).toBe(2);
      expect(await pb.collection(joinCollection).getOne(join.id)).toMatchObject({ tag: tag.id });
      await pb.collection(parent.collectionName).delete(parent.id);
      created.splice(
        created.findIndex(record => record.id === parent.id),
        1
      );
      await pb.collection(tagCollection).delete(tag.id);
    }
  });

  test('tag-sync failure and oversized metadata leave primary, joins, and revision unchanged', async () => {
    const book = await createBook();
    const tags = [];
    for (const index of [1, 2]) {
      tags.push(
        await pb.collection('coloring_tags').create({
          user: userId,
          name: `Rollback ${index} ${randomUUID()}`,
          slug: `rollback-${randomUUID()}`,
          color: '#14b8a6',
        })
      );
    }
    sql(`CREATE TRIGGER fail_tag_sync BEFORE INSERT ON coloring_book_tags
      WHEN NEW.book = '${book.id}' AND NEW.tag = '${tags[1].id}'
      BEGIN SELECT RAISE(ABORT, 'second tag sync failure'); END;`);
    try {
      await expect(
        pb
          .collection('coloring_books')
          .update(
            book.id,
            { title: 'should roll back', og_tag_ids: JSON.stringify(tags.map(tag => tag.id)) },
            { headers: { [expectedRevisionHeader]: '0' } }
          )
      ).rejects.toMatchObject({ status: 400 });
      expect(await pb.collection('coloring_books').getOne(book.id)).toMatchObject({
        title: book.title,
        revision: 0,
      });
      expect(
        Number(sql(`SELECT COUNT(*) FROM coloring_book_tags WHERE book = '${book.id}';`))
      ).toBe(0);
    } finally {
      sql('DROP TRIGGER IF EXISTS fail_tag_sync;');
    }

    await expect(
      pb.collection('coloring_books').update(
        book.id,
        {
          title: 'over limit',
          og_tag_ids: JSON.stringify(
            Array.from({ length: 1001 }, (_, index) => String(index).padStart(15, '0'))
          ),
        },
        { headers: { [expectedRevisionHeader]: '0' } }
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(await pb.collection('coloring_books').getOne(book.id)).toMatchObject({
      title: book.title,
      revision: 0,
    });

    const retry = await pb
      .collection('coloring_books')
      .update(
        book.id,
        { title: 'retry saved', og_tag_ids: JSON.stringify(tags.map(tag => tag.id)) },
        { headers: { [expectedRevisionHeader]: '0' } }
      );
    expect(retry).toMatchObject({ title: 'retry saved', revision: 1 });
    expect(Number(sql(`SELECT COUNT(*) FROM coloring_book_tags WHERE book = '${book.id}';`))).toBe(
      2
    );
    await pb.collection('coloring_books').delete(book.id);
    created.splice(
      created.findIndex(record => record.id === book.id),
      1
    );
    for (const tag of tags) await pb.collection('coloring_tags').delete(tag.id);
  });

  test('guarded tag sync rejects a tag owned by another account before the parent write', async () => {
    const admin = new PocketBase(pocketBaseUrl);
    await admin
      .collection('_superusers')
      .authWithPassword(
        process.env.LOCAL_POCKETBASE_ADMIN_EMAIL ?? '',
        process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD ?? ''
      );
    const other = await admin.collection('users').create({
      email: `other-${randomUUID()}@example.test`,
      username: `other${randomUUID().slice(0, 8)}`,
      password: 'disposable-password-123',
      passwordConfirm: 'disposable-password-123',
      verified: true,
    });
    const foreignTag = await admin.collection('coloring_tags').create({
      user: other.id,
      name: `Foreign ${randomUUID()}`,
      slug: `foreign-${randomUUID()}`,
      color: '#14b8a6',
    });
    const book = await createBook();
    try {
      await expect(
        pb
          .collection('coloring_books')
          .update(
            book.id,
            { title: 'should not save', og_tag_ids: JSON.stringify([foreignTag.id]) },
            { headers: { [expectedRevisionHeader]: '0' } }
          )
      ).rejects.toMatchObject({ status: 400 });
      expect(await pb.collection('coloring_books').getOne(book.id)).toMatchObject({
        title: book.title,
        revision: 0,
      });
      expect(
        Number(sql(`SELECT COUNT(*) FROM coloring_book_tags WHERE book = '${book.id}';`))
      ).toBe(0);
    } finally {
      await admin.collection('coloring_tags').delete(foreignTag.id);
      await admin.collection('users').delete(other.id);
    }
  });

  test('parent deletion cascades through joins without recreating the parent', async () => {
    const book = await createBook();
    const tag = await pb.collection('coloring_tags').create({
      user: userId,
      name: `Cascade ${randomUUID()}`,
      slug: `cascade-${randomUUID()}`,
      color: '#14b8a6',
    });
    await pb.collection('coloring_book_tags').create({ book: book.id, tag: tag.id });
    await pb.collection('coloring_books').delete(book.id);
    created.splice(
      created.findIndex(record => record.id === book.id),
      1
    );
    expect(Number(sql(`SELECT COUNT(*) FROM coloring_book_tags WHERE book = '${book.id}';`))).toBe(
      0
    );
    await pb.collection('coloring_tags').delete(tag.id);
  });

  test('keeps a stale project tab open with its edits and leaves newer fields intact', async ({
    page,
    context,
  }, testInfo) => {
    const project = await createProject();
    const otherTab = await context.newPage();
    await Promise.all([
      page.goto(`/projects/${project.id}`),
      otherTab.goto(`/projects/${project.id}`),
    ]);
    await Promise.all([
      page.getByRole('button', { name: 'Edit project' }).click(),
      otherTab.getByRole('button', { name: 'Edit project' }).click(),
    ]);

    const firstTitle = `${project.title} saved`;
    const localSource = 'https://example.test/unsaved-project-source';
    await page.getByLabel('Project title').fill(firstTitle);
    await otherTab.getByLabel('Source URL').fill(localSource);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit project' })).toHaveCount(0);

    await otherTab.getByRole('button', { name: 'Save changes' }).click();
    await expect(otherTab.getByRole('alert')).toContainText('changed elsewhere');
    await expect(otherTab.getByRole('alert')).toBeInViewport();
    await expect(otherTab.getByLabel('Source URL')).toHaveValue(localSource);
    await expect(otherTab.getByRole('button', { name: 'Review latest' })).toBeVisible();
    await testInfo.attach('project conflict', {
      body: await otherTab.screenshot(),
      contentType: 'image/png',
    });

    const persisted = await pb.collection('projects').getOne(project.id);
    expect(persisted.title).toBe(firstTitle);
    expect(persisted.source_url).not.toBe(localSource);
    await otherTab.close();
  });

  test('rejects a stale coloring page reduction before deleting any pages', async ({
    page,
    context,
  }, testInfo) => {
    const book = await createBook();
    const otherTab = await context.newPage();
    await Promise.all([page.goto(`/coloring/${book.id}`), otherTab.goto(`/coloring/${book.id}`)]);
    await Promise.all([
      page.getByRole('button', { name: 'Edit coloring book' }).click(),
      otherTab.getByRole('button', { name: 'Edit coloring book' }).click(),
    ]);

    const firstTitle = `${book.title} saved`;
    await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(firstTitle);
    await otherTab.getByRole('spinbutton', { name: 'Number of pages' }).fill('1');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit coloring book' })).toHaveCount(0);

    await otherTab.getByRole('button', { name: 'Save changes' }).click();
    await expect(otherTab.getByRole('alert')).toContainText('changed elsewhere');
    await expect(otherTab.getByRole('alert')).toBeInViewport();
    await expect(otherTab.getByRole('spinbutton', { name: 'Number of pages' })).toHaveValue('1');
    await expect(otherTab.getByRole('button', { name: 'Review latest' })).toBeVisible();
    await testInfo.attach('coloring conflict', {
      body: await otherTab.screenshot(),
      contentType: 'image/png',
    });

    const persisted = await pb.collection('coloring_books').getOne(book.id);
    const pages = await pb.collection('coloring_pages').getFullList({
      filter: pb.filter('book = {:bookId}', { bookId: book.id }),
    });
    expect(persisted).toMatchObject({ title: firstTitle, total_pages: 2 });
    expect(pages).toHaveLength(2);
    await otherTab.close();
  });

  test('keeps legacy coloring edit route draft and restores keyboard focus after recovery', async ({
    page,
    context,
  }) => {
    const book = await createBook();
    const otherTab = await context.newPage();
    await Promise.all([
      page.goto(`/coloring/${book.id}/edit`),
      otherTab.goto(`/coloring/${book.id}/edit`),
    ]);
    const newerTitle = `${book.title} newer`;
    const unsavedSource = 'https://example.test/local-coloring-source';
    await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(newerTitle);
    await otherTab.getByRole('textbox', { name: 'Source URL' }).fill(unsavedSource);
    await page.getByRole('button', { name: 'Update book' }).click();
    await expect(page).toHaveURL(`/coloring/${book.id}`);

    const save = otherTab.getByRole('button', { name: 'Update book' });
    await save.focus();
    await save.press('Enter');
    await expect(otherTab.getByRole('alert')).toContainText('changed elsewhere');
    await expect(otherTab.getByRole('alert')).toBeFocused();
    await expect(otherTab.getByRole('alert')).toBeInViewport();
    await expect(otherTab.getByRole('textbox', { name: 'Source URL' })).toHaveValue(unsavedSource);
    const recover = otherTab.getByRole('button', { name: 'Keep my edits for a new save' });
    await recover.focus();
    await recover.press('Enter');
    await expect(otherTab.getByRole('alert')).toHaveCount(0);
    await expect(otherTab.getByRole('button', { name: 'Update book' })).toBeFocused();
    await expect(otherTab.getByRole('textbox', { name: 'Source URL' })).toHaveValue(unsavedSource);
    expect(await pb.collection('coloring_books').getOne(book.id)).toMatchObject({
      title: newerTitle,
      source_url: '',
      revision: 1,
    });
    await otherTab.close();
  });

  test('scopes recovered drawer revision to its book across same-page navigation', async ({
    page,
  }) => {
    const first = await createBook();
    const second = await createBook();
    await page.goto(`/coloring/${first.id}`);
    await page.getByRole('button', { name: 'Edit coloring book' }).click();
    await pb.collection('coloring_books').update(first.id, { title: `${first.title} remote` });
    await page
      .getByRole('textbox', { name: 'Source URL' })
      .fill('https://example.test/first-draft');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('changed elsewhere');
    await page.getByRole('button', { name: 'Keep my edits for a new save' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.evaluate(id => {
      window.history.pushState({}, '', `/coloring/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, second.id);
    await expect(page.getByRole('dialog', { name: 'Edit coloring book' })).toContainText(
      second.title
    );
    await page.getByRole('textbox', { name: 'Title *', exact: true }).fill(`${second.title} saved`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit coloring book' })).toHaveCount(0);
    expect(await pb.collection('coloring_books').getOne(second.id)).toMatchObject({
      title: `${second.title} saved`,
      revision: 1,
    });
  });

  for (const kind of ['project', 'coloring book'] as const) {
    test(`ignores a late ${kind} edit recovery after same-page navigation`, async ({ page }) => {
      const first = kind === 'project' ? await createProject() : await createBook();
      const second = kind === 'project' ? await createProject() : await createBook();
      const collection = first.collectionName;
      const firstPath =
        kind === 'project' ? `/projects/${first.id}/edit` : `/coloring/${first.id}/edit`;
      const secondPath =
        kind === 'project' ? `/projects/${second.id}/edit` : `/coloring/${second.id}/edit`;
      const titleLabel = kind === 'project' ? 'Project title' : 'Title *';
      const saveLabel = kind === 'project' ? 'Update project' : 'Update book';
      await page.goto(firstPath);
      await expect(page.getByLabel(titleLabel, { exact: true })).toHaveValue(first.title);
      await pb.collection(collection).update(first.id, { title: `${first.title} newer` });
      await page.getByLabel(titleLabel, { exact: true }).fill(`${first.title} draft`);
      await page.getByRole('button', { name: saveLabel }).click();
      await expect(page.getByRole('alert')).toContainText('changed elsewhere');

      let releaseRead!: () => void;
      let readStarted!: () => void;
      const blockedRead = new Promise<void>(resolve => {
        releaseRead = resolve;
      });
      const started = new Promise<void>(resolve => {
        readStarted = resolve;
      });
      await page.route(
        url => url.pathname === `/api/collections/${collection}/records/${first.id}`,
        async route => {
          readStarted();
          await blockedRead;
          await route.continue().catch(() => undefined);
        }
      );
      await Promise.all([
        page.getByRole('button', { name: 'Keep my edits for a new save' }).click(),
        started,
      ]);
      await page.evaluate(path => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, secondPath);
      await expect(page.getByLabel(titleLabel, { exact: true })).toHaveValue(second.title);
      releaseRead();
      await page.getByLabel(titleLabel, { exact: true }).fill(`${second.title} saved`);
      await page.getByRole('button', { name: saveLabel }).click();
      await expect(page).toHaveURL(
        kind === 'project' ? `/projects/${second.id}` : `/coloring/${second.id}`
      );
      expect(await pb.collection(collection).getOne(second.id)).toMatchObject({
        title: `${second.title} saved`,
        revision: 1,
      });
    });
  }

  test('remounts a project edit drawer after navigation during recovery', async ({ page }) => {
    const first = await createProject();
    const second = await createProject();
    await page.goto(`/projects/${first.id}`);
    await page.getByRole('button', { name: 'Edit project' }).click();
    await pb.collection('projects').update(first.id, { title: `${first.title} newer` });
    await page.getByLabel('Project title').fill(`${first.title} draft`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('changed elsewhere');

    let releaseRead!: () => void;
    let readStarted!: () => void;
    const blockedRead = new Promise<void>(resolve => {
      releaseRead = resolve;
    });
    const started = new Promise<void>(resolve => {
      readStarted = resolve;
    });
    await page.route(
      url => url.pathname === `/api/collections/projects/records/${first.id}`,
      async route => {
        readStarted();
        await blockedRead;
        await route.continue().catch(() => undefined);
      }
    );
    await Promise.all([
      page.getByRole('button', { name: 'Keep my edits for a new save' }).click(),
      started,
    ]);
    await page.evaluate(id => {
      window.history.pushState({}, '', `/projects/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, second.id);
    await expect(page.getByLabel('Project title')).toHaveValue(second.title);
    releaseRead();
    await page.getByLabel('Project title').fill(`${second.title} saved`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit project' })).toHaveCount(0);
    expect(await pb.collection('projects').getOne(second.id)).toMatchObject({
      title: `${second.title} saved`,
      revision: 1,
    });
  });
});
