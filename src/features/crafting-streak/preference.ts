export type StreakMode = 'off' | 'home' | 'notes';
const sessionChoices = new Map<string, StreakMode>();
const changeEvent = 'crafting-streak-preference';
export const modeKey = (backend: string, userId: string) =>
  `crafting-streak:${encodeURIComponent(backend)}:${encodeURIComponent(userId)}`;
const validMode = (value: unknown): StreakMode =>
  value === 'home' || value === 'notes' ? value : 'off';

export function readMode(key: string): StreakMode {
  if (sessionChoices.has(key)) return sessionChoices.get(key)!;
  try {
    return validMode(localStorage.getItem(key));
  } catch {
    return 'off';
  }
}
export function writeMode(key: string, value: StreakMode) {
  try {
    localStorage.setItem(key, value);
    sessionChoices.delete(key);
  } catch {
    sessionChoices.set(key, value);
  }
  window.dispatchEvent(new Event(changeEvent));
}
export function subscribeMode(callback: () => void) {
  window.addEventListener(changeEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(changeEvent, callback);
    window.removeEventListener('storage', callback);
  };
}
