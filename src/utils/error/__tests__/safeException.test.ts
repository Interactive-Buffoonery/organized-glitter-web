import { describe, expect, it, vi } from 'vitest';
import { safeException } from '@/utils/error/safeException';

const asset = () => `${window.location.origin}/assets/main-AbCd1234.js`;

describe('safeException', () => {
  it('retains bounded V8 and Safari app frames without raw function names or URL tokens', () => {
    const error = new ReferenceError('private notes, filename.png, password=synthetic-password');
    Object.defineProperty(error, 'stack', {
      value: `ReferenceError: private notes
    at privateFilename.png (${asset()}?token=synthetic-token#private:12:34)
privateNotes@${asset()}:56:78
    at https://other.test/assets/main-AbCd1234.js:1:2
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
