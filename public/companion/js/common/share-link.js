/**
 * URL sharing helpers for calculator state.
 */

function encodePayload(state) {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodePayload(encoded) {
  return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}

export function encodeStateToUrl(state, locationRef = window.location) {
  const params = new URLSearchParams(locationRef.search);
  params.set("s", encodePayload(state));
  return `${locationRef.origin}${locationRef.pathname}?${params.toString()}`;
}

export function decodeStateFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const encoded = params.get("s");
  if (!encoded) return null;

  try {
    return decodePayload(encoded);
  } catch {
    return null;
  }
}

export function clearShareParam(locationRef = window.location) {
  const url = new URL(locationRef.href);
  if (!url.searchParams.has("s")) return;
  url.searchParams.delete("s");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
