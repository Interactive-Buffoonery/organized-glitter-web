import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const script = () => readFileSync('public/js/static-hosting-notice.js', 'utf8');
const dismissalKey = 'hosting-notice-spacefast-weekend-dismissed';

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML =
    '<section data-notice-id="weekend-hosting"><div data-notice-content>Notice<template data-notice-dismiss><button type="button" aria-label="Close hosting notice">Close</button></template></div></section><main id="main-content" tabindex="-1">Home</main>';
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  sessionStorage.clear();
});
const run = () => new Function(script())();

describe('static hosting notice', () => {
  it('adds one accessible close control and preserves dismissal across app navigation', () => {
    run();
    run();
    const buttons = document.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].type).toBe('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('Close hosting notice');
    buttons[0].click();
    expect(document.querySelector('[data-notice-id]')).toBeNull();
    expect(sessionStorage.getItem(dismissalKey)).toBe('true');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });

  it('hides a notice already dismissed by the React app', () => {
    sessionStorage.setItem(dismissalKey, 'true');
    run();
    expect(document.querySelector('[data-notice-id]')).toBeNull();
  });

  it('can dismiss when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    run();
    document.querySelector('button')?.click();
    expect(document.querySelector('[data-notice-id]')).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });

  it('does nothing on pages without the static notice', () => {
    document.body.innerHTML = '<main>Other page</main>';
    run();
    expect(document.querySelector('button')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
