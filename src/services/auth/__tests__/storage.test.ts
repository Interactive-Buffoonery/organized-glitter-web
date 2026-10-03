import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGlobalAuthClear } from '@/services/auth';

const { clearMock } = vi.hoisted(() => ({
  clearMock: vi.fn(),
}));

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: {
      clear: clearMock,
    },
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const createStorageMock = () => {
  const storageMock: Storage = {
    get length() {
      return Object.keys(storageMock).filter(key => typeof storageMock[key] === 'string').length;
    },
    clear: vi.fn(() => {
      Object.keys(storageMock).forEach(key => {
        if (typeof storageMock[key] === 'string') {
          delete storageMock[key];
        }
      });
    }),
    getItem: vi.fn((key: string) => {
      return typeof storageMock[key] === 'string' ? storageMock[key] : null;
    }),
    key: vi.fn((index: number) => {
      return (
        Object.keys(storageMock).filter(key => typeof storageMock[key] === 'string')[index] ?? null
      );
    }),
    removeItem: vi.fn((key: string) => {
      delete storageMock[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      storageMock[key] = String(value);
    }),
  };

  return storageMock;
};

describe('auth storage cleanup', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const originalSessionStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    delete (window as Window & { clearOrganizedGlitterAuth?: () => void })
      .clearOrganizedGlitterAuth;
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    if (originalSessionStorage) {
      Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
    }
  });

  it('registers a dev global auth cleanup helper', async () => {
    const cleanup = setupGlobalAuthClear();

    expect(window.clearOrganizedGlitterAuth).toEqual(expect.any(Function));

    cleanup();

    expect(window.clearOrganizedGlitterAuth).toBeUndefined();
  });

  it('clears PocketBase auth and known browser auth keys', async () => {
    localStorage.setItem('pocketbase_auth', 'token');
    localStorage.setItem('pb_user', 'user');
    localStorage.setItem('diamond-art-auth-token-v1', 'token');
    localStorage.setItem('unrelated', 'keep');
    sessionStorage.setItem('pocketbase_auth_token', 'token');
    sessionStorage.setItem('pb_session', 'session');
    sessionStorage.setItem('unrelated', 'keep');

    setupGlobalAuthClear();
    await window.clearOrganizedGlitterAuth?.();

    expect(clearMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem('pocketbase_auth')).toBeNull();
    expect(localStorage.getItem('pb_user')).toBeNull();
    expect(localStorage.getItem('diamond-art-auth-token-v1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(sessionStorage.getItem('pocketbase_auth_token')).toBeNull();
    expect(sessionStorage.getItem('pb_session')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});
