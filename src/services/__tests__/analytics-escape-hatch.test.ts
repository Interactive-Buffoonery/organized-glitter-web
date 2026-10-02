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
      expect(errorArg).toBe(err);
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
      expect((errorArg as Error).message).toBe('something went wrong');
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
        non_error_keys: ['code', 'detail', 'token'],
      });
    });

    it('caps non-Error object key metadata', () => {
      const payload = Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [`key_${index}`, `value_${index}`])
      );

      captureException(payload);

      const [, propsArg] = mockCaptureException.mock.calls[0];
      expect(propsArg.non_error_keys).toEqual([
        'key_0',
        'key_1',
        'key_2',
        'key_3',
        'key_4',
        'key_5',
        'key_6',
        'key_7',
        'key_8',
        'key_9',
      ]);
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
