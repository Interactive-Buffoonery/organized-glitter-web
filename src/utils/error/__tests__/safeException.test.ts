import { describe, expect, it, vi } from 'vitest';
import { safeException } from '@/utils/error/safeException';

const asset = () => `${window.location.origin}/assets/index-AbCd1234.js`;

describe('safeException', () => {
  it('retains bounded V8 and Safari app frames without raw function names or URL tokens', () => {
    const error = new ReferenceError('private notes, filename.png, password=synthetic-password');
    Object.defineProperty(error, 'stack', {
      value: `ReferenceError: private notes
    at privateFilename.png (${asset()}?token=synthetic-token#private:12:34)
privateNotes@${asset()}:56:78
    at https://other.test/assets/index-AbCd1234.js:1:2
    at file:///Users/private-person/privateFilename.png:1:2
    at ${window.location.origin}/assets/privateFilename-AbCd1234.js:1:2
    at ${window.location.origin}/src/privateFilename.ts:1:2
    at chrome-extension://synthetic-id/privateFilename.js:1:2
    at blob:${asset()}:1:2`,
      configurable: true,
    });
    const safe = safeException(error).error;
    expect(safe.name).toBe('ReferenceError');
    expect(safe.stack).toBe(`ReferenceError: Application error (message redacted)
    at ${asset()}:12:34
    at ${asset()}:56:78`);
  });

  it('bounds stack size and count, dropping malformed and credentialed locations', () => {
    const error = new Error('private notes');
    const url = new URL(asset());
    url.username = 'synthetic-user';
    url.password = 'synthetic-password';
    Object.defineProperty(error, 'stack', {
      value: `Error: private notes
    at ${url}:1:2
    at ${asset()}:NaN:2
    at ${asset()}:12345678:2
${Array.from({ length: 1000 }, (_, i) => `    at ${asset()}:${i + 1}:2`).join('\n')}`,
      configurable: true,
    });
    const safe = safeException(error).error;
    expect(safe.stack?.split('\n')).toHaveLength(21);
    expect(safe.stack?.length).toBeLessThan(4000);
    expect(safe.stack).not.toMatch(/synthetic|private|NaN|12345678/);
  });

  it('discards huge header text and never substitutes a sanitizer stack', () => {
    const error = new Error('private notes');
    Object.defineProperty(error, 'stack', {
      value: `Error: ${'private notes'.repeat(2000)}\n    at ${asset()}:1:2`,
      configurable: true,
    });
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
    expect(safeException('private notes').error.stack).toBe('Error: Non-Error thrown (string)');
  });

  it('does not execute message, stack or prototype name accessors', () => {
    const getter = vi.fn(() => 'private notes');
    const error = new Error('private notes');
    Object.defineProperties(error, { message: { get: getter }, stack: { get: getter } });
    const prototype = Object.create(Error.prototype);
    Object.defineProperty(prototype, 'name', { get: getter });
    Object.setPrototypeOf(error, prototype);
    expect(safeException(error).error.stack).toBe('Error: Application error (message redacted)');
    expect(getter).not.toHaveBeenCalled();
  });

  it('reads a native V8 stack accessor only with safe headers and no custom formatter', () => {
    const formatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    Object.defineProperty(Error, 'prepareStackTrace', { value: undefined, configurable: true });
    try {
      const error = new TypeError('private notes');
      error.stack = `TypeError: private notes\n    at ${asset()}:1:2`;
      expect(safeException(error).error.stack).toBe(
        `TypeError: Application error (message redacted)\n    at ${asset()}:1:2`
      );
      const stringify = vi.fn(() => 'private notes');
      Object.defineProperty(error, 'message', {
        value: { toString: stringify },
        configurable: true,
      });
      expect(safeException(error).error.stack).toBe(
        'TypeError: Application error (message redacted)'
      );
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      if (formatter) Object.defineProperty(Error, 'prepareStackTrace', formatter);
      else Reflect.deleteProperty(Error, 'prepareStackTrace');
    }
  });

  it('never invokes a custom V8 stack formatter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    const formatter = vi.fn(() => 'private notes');
    Object.defineProperty(Error, 'prepareStackTrace', { value: formatter, configurable: true });
    try {
      expect(safeException(new Error('private notes')).error.stack).toBe(
        'Error: Application error (message redacted)'
      );
      expect(formatter).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(Error, 'prepareStackTrace', descriptor);
      else Reflect.deleteProperty(Error, 'prepareStackTrace');
    }
  });

  it('groups by fixed type and retained location rather than private message text', () => {
    const stacks = ['private diary one', 'private diary two'].map(message => {
      const error = new TypeError(message);
      Object.defineProperty(error, 'stack', {
        value: `TypeError: ${message}\n    at ${asset()}:12:34`,
      });
      return safeException(error).error.stack;
    });
    expect(stacks[0]).toBe(stacks[1]);
    expect(stacks[0]).toContain(':12:34');
  });

  it('redacts custom names, causes and aggregate members without mutating the original', () => {
    const error = new AggregateError([new Error('private notes')], 'private notes', {
      cause: 'password=synthetic-password',
    });
    error.name = 'privateFilename.png';
    const safe = safeException(error).error;
    expect(safe.name).toBe('Error');
    expect(safe).not.toHaveProperty('cause');
    expect(safe).not.toHaveProperty('errors');
    expect(error.name).toBe('privateFilename.png');
  });
});
