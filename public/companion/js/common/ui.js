/**
 * Shared UI helpers.
 * Placeholder — implementation in a later phase.
 */

export function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

export function showError(id, message) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
}

export function setLoading(isLoading) {
  document.body.classList.toggle("pc-is-loading", isLoading);
}
