import { beforeEach, expect, it, vi } from 'vitest';
import { readMode, writeMode, modeKey } from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('defaults off, stores one mode and isolates accounts and backends', () => {
  expect(readMode(modeKey('https://a.test', 'one'))).toBe('off');
  writeMode(modeKey('https://a.test', 'one'), 'home');
  expect(readMode(modeKey('https://a.test', 'one'))).toBe('home');
  expect(readMode(modeKey('https://a.test', 'two'))).toBe('off');
  expect(readMode(modeKey('https://b.test', 'one'))).toBe('off');
  writeMode(modeKey('https://a.test', 'one'), 'off');
  expect(readMode(modeKey('https://a.test', 'one'))).toBe('off');
});
it('fails closed for invalid values', () => {
  localStorage.setItem('invalid', 'everything');
  expect(readMode('invalid')).toBe('off');
  localStorage.setItem('retired', 'notes');
  expect(readMode('retired')).toBe('off');
});
it('keeps a session choice when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error();
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error();
  });
  writeMode('blocked', 'home');
  expect(readMode('blocked')).toBe('home');
  expect(readMode('other-blocked')).toBe('off');
});
