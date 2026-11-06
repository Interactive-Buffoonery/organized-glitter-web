import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const module = { exports: {} };
vm.runInNewContext(readFileSync('pb_hooks/lifecycle_status.js', 'utf8'), { module });
const { applyCompletionStatus } = module.exports;

// Pin changed dates, historical dates, clearing, exemptions and restore separately.
describe.each(['date_completed', 'completed_at'])('%s lifecycle', field => {
  it.each([
    [false, '', '2026-01-01', 'progress', false, 'completed'],
    [true, '2026-01-01', '2026-01-02', 'progress', false, 'completed'],
    [true, '2026-01-01', '2026-01-01', 'progress', false, 'progress'],
    [true, '2026-01-01', '', 'completed', false, 'completed'],
    [false, '', '2026-01-01', 'archived', false, 'archived'],
    [true, '', '2026-01-01', 'destashed', false, 'destashed'],
    [false, '', '2026-01-01', 'progress', true, 'progress'],
    [true, '', '2026-01-01', 'progress', true, 'progress'],
  ])('preserves lifecycle policy %#', (isUpdate, saved, date, status, restore, expected) => {
    const data = { [field]: date, status };
    const e = {
      context: { value: () => restore },
      record: {
        getString: key => data[key] || '',
        original: () => ({ getString: () => saved }),
        set: (key, value) => {
          data[key] = value;
        },
      },
    };
    applyCompletionStatus(e, field, isUpdate);
    expect(data.status).toBe(expected);
    expect(data[field]).toBe(date);
  });
});

describe('project lifecycle hook boundary', () => {
  it('applies lifecycle before computing sort fields and continues after lifecycle failure', () => {
    for (const fails of [false, true]) {
      const calls = [];
      const handlers = [];
      const e = { app: { logger: () => ({ error: () => calls.push('logged') }) } };
      vm.runInNewContext(readFileSync('pb_hooks/sort_proxy_sync.pb.js', 'utf8'), {
        __hooks: '',
        require: path =>
          path.endsWith('/lifecycle_status.js')
            ? {
                applyCompletionStatus: () => {
                  calls.push('lifecycle');
                  if (fails) throw new Error('test failure');
                },
              }
            : { syncProject: () => calls.push('sort') },
        onRecordCreate: handler => handlers.push(handler),
        onRecordUpdate: () => {},
      });
      handlers[0](e);
      expect(calls).toEqual(fails ? ['lifecycle', 'logged', 'sort'] : ['lifecycle', 'sort']);
    }
  });
});
