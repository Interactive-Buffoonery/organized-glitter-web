import PocketBase from 'pocketbase';

const baseUrl = process.env.LOCAL_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)) {
  throw new Error('Completion status smoke test requires local PocketBase.');
}

const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let project;
let book;
try {
  await pb
    .collection('users')
    .authWithPassword(
      process.env.LOCAL_POCKETBASE_TEST_USER_EMAIL ?? 'sarah-local@example.test',
      process.env.LOCAL_POCKETBASE_TEST_USER_PASSWORD ?? 'local-test-password-123'
    );
  const suffix = Date.now().toString(36);
  project = await pb.collection('projects').create({
    user: pb.authStore.record.id,
    title: `Lifecycle test ${suffix}`,
    kit_category: 'full',
    status: 'progress',
    date_completed: '2026-09-20',
  });
  assert(project.status === 'completed', 'Project create should complete from date.');
  assert(project.status_order === 7, 'Project sort order should match Completed.');
  const projectedDates = await pb.collection('projects').getOne(project.id, {
    fields: 'id,user,status,date_purchased,date_started,date_completed',
  });
  assert(
    projectedDates.status === 'completed' &&
      String(projectedDates.date_completed).startsWith('2026-09-20'),
    'Projected date read should include the fields needed by inline validation.'
  );
  project = await pb.collection('projects').update(project.id, { status: 'progress' });
  assert(
    project.status === 'progress' && project.date_completed,
    'Project status edit should keep date.'
  );
  project = await pb.collection('projects').update(project.id, {
    title: `Retitled ${suffix}`,
    date_completed: '2026-09-20',
  });
  assert(project.status === 'progress', 'Unrelated project edit should keep manual status.');
  project = await pb.collection('projects').update(project.id, { date_completed: '2026-09-21' });
  assert(project.status === 'completed', 'Changing project completion date should complete it.');
  project = await pb.collection('projects').update(project.id, {
    status: 'archived',
    date_completed: '2026-09-22',
  });
  assert(project.status === 'archived', 'Project date should preserve Archived.');
  project = await pb.collection('projects').update(project.id, {
    status: 'progress',
    date_completed: '',
  });
  assert(
    project.status === 'progress' && !project.date_completed,
    'Project date clear should keep status.'
  );
  project = await pb.collection('projects').update(project.id, { status: 'completed' });
  assert(!project.date_completed, 'Project status-only completion should not invent a date.');

  book = await pb.collection('coloring_books').create({
    user: pb.authStore.record.id,
    title: `Lifecycle book ${suffix}`,
    total_pages: 1,
    status: 'in_progress',
    date_completed: '2026-09-20',
  });
  assert(book.status === 'completed', 'Book create should complete from date.');
  book = await pb.collection('coloring_books').update(book.id, { status: 'in_progress' });
  assert(
    book.status === 'in_progress' && book.date_completed,
    'Book status edit should keep date.'
  );
  book = await pb.collection('coloring_books').update(book.id, {
    title: `Retitled book ${suffix}`,
    date_completed: '2026-09-20',
  });
  assert(book.status === 'in_progress', 'Unchanged book date should keep manual status.');
  book = await pb.collection('coloring_books').update(book.id, { date_completed: '2026-09-21' });
  assert(book.status === 'completed', 'Changing book completion date should complete it.');
  book = await pb.collection('coloring_books').update(book.id, {
    status: 'archived',
    date_completed: '2026-09-22',
  });
  assert(book.status === 'archived', 'Book date should preserve Archived.');
  book = await pb.collection('coloring_books').update(book.id, {
    status: 'in_progress',
    date_completed: '',
  });
  book = await pb.collection('coloring_books').update(book.id, { status: 'completed' });
  assert(!book.date_completed, 'Book status-only completion should not invent a date.');

  const pages = await pb.collection('coloring_pages').getFullList({
    filter: pb.filter('book = {:bookId}', { bookId: book.id }),
  });
  assert(pages.length === 1, 'Book should generate one page.');
  let page = await pb.collection('coloring_pages').update(pages[0].id, {
    completed_at: '2026-09-20',
  });
  assert(page.status === 'completed', 'Page completion date should complete it.');
  const refreshedBook = await pb.collection('coloring_books').getOne(book.id);
  assert(refreshedBook.completed_pages === 1, 'Page completion should update book metrics.');
  page = await pb.collection('coloring_pages').update(page.id, { status: 'in_progress' });
  assert(page.status === 'in_progress' && page.completed_at, 'Page reopen should preserve date.');
  assert(!page.started_at, 'Page progress status should not invent start date.');
  page = await pb.collection('coloring_pages').update(page.id, { revealed_subject: 'Test' });
  assert(page.status === 'in_progress', 'Unrelated page edit should keep manual status.');
  page = await pb.collection('coloring_pages').update(page.id, { completed_at: '' });
  assert(
    page.status === 'in_progress' && !page.completed_at,
    'Page date clear should keep status.'
  );
  page = await pb.collection('coloring_pages').update(page.id, { status: 'completed' });
  assert(!page.completed_at, 'Page status-only completion should not invent a date.');
  console.log('Local PocketBase completion lifecycle: passed.');
} catch (error) {
  console.error(error.response?.data ?? error.message);
  process.exitCode = 1;
} finally {
  if (book) await pb.collection('coloring_books').delete(book.id);
  if (project) await pb.collection('projects').delete(project.id);
}
