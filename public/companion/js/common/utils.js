/**
 * Shared utility functions.
 * Placeholder — implementation in a later phase.
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}
