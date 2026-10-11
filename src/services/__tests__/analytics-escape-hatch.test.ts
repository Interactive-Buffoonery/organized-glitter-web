import { vi, describe, it, expect, beforeEach } from 'vitest';
import { capture, captureException } from '@/services/analytics-escape-hatch';

const mockCapture = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => mockCapture(...args),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}));

describe('analytics-escape-hatch', () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockCaptureException.mockClear();
  });

  describe('capture', () => {
    it('forwards the event name and properties to posthog.capture', () => {
      capture('project_created', { id: '123' });
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith('project_created', { id: '123' });
    });

    it('works without properties', () => {
      capture('dashboard_loaded');
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith('dashboard_loaded', undefined);
    });
  });

  describe('captureException', () => {
    it('uses posthog.captureException (not posthog.capture)', () => {
      captureException(new Error('boom'));
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('forwards an Error and merges classifier output with caller props', () => {
      const err = new Error('boom');
      captureException(err, { $exception_source: 'test' });

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
      expect(errorArg).not.toBe(err);
      expect(errorArg.message).toBe('Application error (message redacted)');
      expect(propsArg).toMatchObject({
        $exception_source: 'test',
        suspected_external_script: false,
      });
    });

    it('normalizes a string reason into a real Error', () => {
      captureException('something went wrong');
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
      expect(errorArg).toBeInstanceOf(Error);
      expect((errorArg as Error).message).toBe('Non-Error thrown (string)');
      expect(propsArg).toMatchObject({ non_error_type: 'string' });
    });

    it('normalizes a non-Error object without serializing its values', () => {
      captureException({ code: 500, detail: 'server fell over', token: 'secret-value' });
      const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
      expect(errorArg).toBeInstanceOf(Error);
      expect((errorArg as Error).message).toBe('Non-Error thrown (object)');
      expect((errorArg as Error).message).not.toContain('server fell over');
      expect(JSON.stringify(propsArg)).not.toContain('server fell over');
      expect(JSON.stringify(propsArg)).not.toContain('secret-value');
      expect(propsArg).toMatchObject({
        non_error_type: 'object',
      });
    });

    it('omits arbitrary object keys as well as values', () => {
      captureException({ 'private-photo.png': 'private diary text' });
      const [error, properties] = mockCaptureException.mock.calls[0];
      expect(properties).not.toHaveProperty('non_error_keys');
      expect(`${error.stack} ${JSON.stringify(properties)}`).not.toMatch(/private-photo|diary/);
    });

    it('redacts messages, custom fields and stack text while retaining app locations', () => {
      const error = new TypeError('private diary https://example.test/reset?token=synthetic-token');
      Object.defineProperty(error, 'stack', {
        value: `TypeError: private diary password=synthetic-password
    at privatePhoto.png (${window.location.origin}/assets/index-AbCd1234.js?token=synthetic-token:12:34)
private diary text
    at https://example.test/private-photo.png:1:2`,
        configurable: true,
      });
      Object.assign(error, {
        cause: { password: 'synthetic-password' },
        toJSON: () => 'private diary',
      });
      captureException(error);
      const [safe] = mockCaptureException.mock.calls[0];
      expect(safe.name).toBe('TypeError');
      expect(safe.stack).toBe(
        `TypeError: Application error (message redacted)\n    at ${window.location.origin}/assets/index-AbCd1234.js:12:34`
      );
      expect(safe).not.toHaveProperty('cause');
      expect(safe).not.toHaveProperty('toJSON');
      expect(error.message).toContain('private diary');
    });

    it.each([
      null,
      undefined,
      42,
      true,
      Symbol('private diary'),
      ['private-photo.png'],
      { message: 'private diary' },
    ])('does not expose malformed thrown content (%s)', value => {
      captureException(value);
      const [safe, properties] = mockCaptureException.mock.calls[0];
      expect(`${safe.stack} ${JSON.stringify(properties)}`).not.toMatch(
        /private diary|private-photo/
      );
    });

    it('never invokes custom stringification or getters and handles circular/revoked values', () => {
      const stringify = vi.fn(() => {
        throw new Error('must not execute');
      });
      const getter = vi.fn(() => {
        throw new Error('must not execute');
      });
      const circular: Record<string, unknown> = { toString: stringify, toJSON: stringify };
      circular.self = circular;
      Object.defineProperty(circular, 'message', { get: getter });
      const error = new Error('private diary');
      Object.defineProperty(error, 'stack', { get: getter });
      const revocable = Proxy.revocable({}, {});
      revocable.revoke();
      for (const value of [circular, error, revocable.proxy]) {
        expect(() => captureException(value)).not.toThrow();
      }
      expect(stringify).not.toHaveBeenCalled();
      expect(getter).not.toHaveBeenCalled();
    });

    it('tags a suspected external error from classification', () => {
      const err = new Error('runtime.sendMessage(). Tab not found');
      captureException(err);
      const [, propsArg] = mockCaptureException.mock.calls[0];
      expect(propsArg).toMatchObject({
        suspected_external_script: true,
        error_origin: 'browser_extension_or_external',
      });
    });

    it('lets caller props override classifier defaults', () => {
      const err = new Error('boom');
      captureException(err, { suspected_external_script: true });
      const [, propsArg] = mockCaptureException.mock.calls[0];
      expect(propsArg.suspected_external_script).toBe(true);
    });

    it('lets caller props override generated non-Error metadata', () => {
      captureException({ code: 500 }, { non_error_type: 'caller-type' });
      const [, propsArg] = mockCaptureException.mock.calls[0];
      expect(propsArg.non_error_type).toBe('caller-type');
    });
  });
});
