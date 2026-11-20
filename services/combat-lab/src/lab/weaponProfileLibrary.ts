import Model from 'src/Model';
import {pack} from 'src/simulation/model';
import {Mode, PackedModel} from 'src/simulation/types';

interface NamedProfile { name: string; model: PackedModel; }
export interface SavedProfile extends NamedProfile { revision: string; }
export interface Library { accountId: number; profiles: SavedProfile[]; }
interface LegacyImport { accountId: number; importId: string; profiles: NamedProfile[]; }

export const profilesChanged = 'companion-weapon-profiles-changed';
export const sessionChanged = 'companion-weapon-profile-session-changed';
const storageKey = (mode: Mode) => `companion-weapon-profiles-${mode}`;

export class ProfileRequestError extends Error {
  constructor(readonly status: number) {
    super('Weapon profile request failed');
    Object.setPrototypeOf(this, ProfileRequestError.prototype);
  }
}

export async function requestProfiles(mode: Mode, accountId?: number, method = 'GET', body?: object) {
  const path = '/api/account/weapon-profiles/' + mode + (method === 'POST' ? '/import' : '');
  const response = await fetch(path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: {
      ...(accountId !== undefined && {'X-Weapon-Profile-Account': String(accountId)}),
      ...(body && {'Content-Type': 'application/json'}),
    },
    ...(body && {body: JSON.stringify(body)}),
  });
  if (!response.ok) throw new ProfileRequestError(response.status);
  const result = await response.json();
  if (!Number.isSafeInteger(result.accountId) || (accountId !== undefined && result.accountId !== accountId)) {
    throw new ProfileRequestError(401);
  }
  return result;
}

// Browser presets from before account storage have no owner or schema version.
// Copy only data fields of the current model and use its defaults for later additions.
function normalizeProfile(row: NamedProfile): NamedProfile {
  const raw = row?.model;
  if (typeof row?.name !== 'string' || !row.name.trim() || !raw || !Array.isArray(raw.abilities) ||
      !['numDice','diceStat','normDmg','critDmg'].every(key => Number.isInteger(raw[key]))) {
    throw Error('Invalid weapon profile');
  }
  const model = pack(new Model());
  for (const [key, fallback] of Object.entries(model)) {
    const value = raw[key];
    if (value === undefined) continue;
    if (Array.isArray(fallback)) {
      if (Array.isArray(value)) model[key] = value.filter(item => typeof item === 'string' && !Object.prototype.hasOwnProperty.call(Object.prototype, item));
    } else if (value !== null && typeof value === typeof fallback && !Array.isArray(value)) {
      model[key] = value;
    }
  }
  return {name: row.name.trim(), model};
}

export async function listProfiles(mode: Mode, accountId?: number): Promise<Library> {
  const result = await requestProfiles(mode, accountId);
  if (!Array.isArray(result.profiles)) throw Error('Invalid weapon profile list');
  return {accountId: result.accountId, profiles: result.profiles.map((row: SavedProfile) => ({
    ...normalizeProfile(row), revision: row.revision,
  }))};
}

function readLegacy(mode: Mode, accountId: number): NamedProfile[] | LegacyImport | null {
  const raw = JSON.parse(localStorage.getItem(storageKey(mode)) || 'null');
  if (Array.isArray(raw)) return raw.length ? raw : null;
  return raw?.accountId === accountId && typeof raw.importId === 'string' && Array.isArray(raw.profiles) ? raw : null;
}

export function hasLegacy(mode: Mode, accountId: number) {
  try { return Boolean(readLegacy(mode, accountId)); } catch { return false; }
}

export function notifyProfiles(mode: Mode) {
  window.dispatchEvent(new CustomEvent(profilesChanged, {detail: mode}));
  // Other tabs receive only an invalidation notice, never names or model data.
  try { localStorage.setItem(profilesChanged, mode + ':' + Math.random()); } catch { /* optional */ }
}

export async function importBrowserProfiles(mode: Mode, accountId: number) {
  const key = storageKey(mode);
  const source = readLegacy(mode, accountId);
  if (!source) throw Error('Browser profiles are no longer available');
  // A stale tab must not bind an unclaimed browser backup after someone else signs in.
  if (Array.isArray(source)) await requestProfiles(mode, accountId);
  const claim = () => {
    const saved = readLegacy(mode, accountId);
    if (!saved || !Array.isArray(saved)) return saved;
    const batch: LegacyImport = {accountId, importId: crypto.randomUUID(), profiles: saved.map(normalizeProfile)};
    localStorage.setItem(key, JSON.stringify(batch));
    return batch;
  };
  // Serialize the local claim across tabs. The API independently checks the active session.
  const batch = navigator.locks ? await navigator.locks.request(key, claim) : claim();
  if (!batch) throw Error('Browser profiles are no longer available');
  await requestProfiles(mode, accountId, 'POST', {importId: batch.importId, profiles: batch.profiles});
  const remaining = readLegacy(mode, accountId);
  if (remaining && !Array.isArray(remaining) && remaining.importId === batch.importId) localStorage.removeItem(key);
}
