/**
 * Local storage helpers.
 * Placeholder — implementation in a later phase.
 */

const PREFIX = "kt-tools:";

export function readStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}
