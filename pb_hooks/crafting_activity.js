const SLOT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MARK_DAYS_BACK = 8;
const MARK_DAYS_AHEAD = 1;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const TRACKED_COLLECTIONS = [
  'projects',
  'progress_notes',
  'project_tags',
  'tags',
  'companies',
  'artists',
  'coloring_books',
  'coloring_pages',
  'coloring_page_progress_notes',
  'coloring_book_tags',
  'coloring_tags',
  'coloring_mediums',
  'book_illustrators',
  'book_publishers',
  'coloring_page_color_references',
  'coloring_page_color_keys',
  'coloring_symbol_requests',
];

function slotFor(ms) {
  return new Date(Math.floor(ms / SLOT_MS) * SLOT_MS).toISOString().replace('T', ' ');
}

// Never throws: activity is a side effect and must not fail or slow the write it follows.
function record(app, auth, nowMs) {
  if (!auth || (auth.isSuperuser && auth.isSuperuser())) return;
  try {
    const ms = nowMs === undefined ? Date.now() : nowMs;
    const stamp = new Date(ms).toISOString().replace('T', ' ');
    app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO crafting_activity (id, user, slot, created, updated) VALUES ({:id}, {:user}, {:slot}, {:stamp}, {:stamp})'
      )
      .bind({
        id: $security.randomStringWithAlphabet(15, ID_ALPHABET),
        user: auth.id,
        slot: slotFor(ms),
        stamp,
      })
      .execute();
  } catch (error) {
    app.logger().warn('Crafting activity was not recorded', 'error', String(error));
  }
}

function afterRequest(e) {
  e.next();
  record(e.app, e.auth);
}

function afterRoute(e) {
  e.next();
  const status = e.status();
  if (status >= 200 && status < 400) record(e.app, e.auth);
}

function validateMarkDay(day, nowMs) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!match) throw new BadRequestError('Choose a valid day.');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = Number(match[3]);
  const dayMs = Date.UTC(year, month, date);
  const parsed = new Date(dayMs);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== date
  ) {
    throw new BadRequestError('Choose a valid day.');
  }
  const todayMs = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const offset = Math.round((dayMs - todayMs) / DAY_MS);
  if (offset < -MARK_DAYS_BACK || offset > MARK_DAYS_AHEAD) {
    throw new BadRequestError('Only days from this week can be marked.');
  }
}

module.exports = {
  TRACKED_COLLECTIONS,
  afterRequest,
  afterRoute,
  record,
  slotFor,
  validateMarkDay,
};
