import { captureException } from '@/services/analytics-escape-hatch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const manifest = document.createElement('script');
    manifest.id = 'app-bootstrap-resources';
    manifest.type = 'application/json';
    manifest.textContent = JSON.stringify({
      graphs: {
        '/assets/main-AbCd1234.js': [],
        '/assets/ProjectDetail-LongerBuildHash123.js': [],
      },
    });
    document.head.appendChild(manifest);
    mockCapture.mockClear();
    mockCaptureException.mockClear();
  });

  afterEach(() => document.getElementById('app-bootstrap-resources')?.remove());

  describe('captureException', () => {
    it.each(['v8', 'safari'])('passes build-listed lazy locations to the SDK (%s)', format => {
      const path = `${window.location.origin}/assets/ProjectDetail-LongerBuildHash123.js`;
      const error = new Error('private diary token=synthetic-token');
      Object.defineProperty(error, 'stack', {
        value:
          format === 'v8'
            ? `Error: private diary\n    at privatePhoto.png (${path}?token=synthetic-token:12:34)`
            : `privatePhoto.png@${path}?token=synthetic-token:12:34`,
      });
      captureException(error);
      const [safe] = mockCaptureException.mock.calls[0];
      expect(safe.stack).toBe(`Error: Application error (message redacted)\n    at ${path}:12:34`);
      expect(`${safe.stack} ${JSON.stringify(mockCaptureException.mock.calls[0][1])}`).not.toMatch(
        /privatePhoto|diary|synthetic-token/
      );
    });

    it('redacts messages, custom fields and stack text while retaining app locations', () => {
      const error = new TypeError('private diary https://example.test/reset?token=synthetic-token');
      Object.defineProperty(error, 'stack', {
        value: `TypeError: private diary password=synthetic-password
    at privatePhoto.png (${window.location.origin}/assets/main-AbCd1234.js?token=synthetic-token:12:34)
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
        `TypeError: Application error (message redacted)\n    at ${window.location.origin}/assets/main-AbCd1234.js:12:34`
      );
      expect(safe).not.toHaveProperty('cause');
      expect(safe).not.toHaveProperty('toJSON');
      expect(error.message).toContain('private diary');
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
  });
});
