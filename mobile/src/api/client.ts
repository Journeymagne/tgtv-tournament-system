import type { Game, Id, JsonRecord, Locale, Notifications, Participant, RegisterInput, ResultInput, RosterInput, Session, TableInput, Team, TournamentDetail, TournamentList } from './types';

export type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal; timeoutMs?: number };
export type Query = Record<string, string | number | boolean | undefined | null>;
const configuredOrigin = process.env.EXPO_PUBLIC_API_URL || 'https://ktcompanion.ru';
const origin = new URL(configuredOrigin);
const productionHosts = new Set(['ktcompanion.ru', 'killteamcompanion.com']);
const developmentHost = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)$/.test(origin.hostname);
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
    !(origin.protocol === 'https:' && productionHosts.has(origin.hostname) || __DEV__ && developmentHost && ['http:', 'https:'].includes(origin.protocol))) {
  throw new Error('EXPO_PUBLIC_API_URL must be a Companion HTTPS origin (or a local development host in development).');
}
export const API_ORIGIN = origin.origin;

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = 'network', public writeOutcomeUnknown = false, public retryAfter: number | null = null, public readonly details: Record<string, unknown> = {}) {
    super(message); this.name = 'ApiError';
  }
}

function errorCode(status: number): string {
  return ({ 400: 'validation', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'too_large', 429: 'rate_limit' } as Record<number, string>)[status] || 'server';
}
function retrySeconds(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

/** Never retries writes. A timeout does not prove the server rolled the transaction back. */
export async function request<T = JsonRecord>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw new ApiError('Invalid API path', 0, 'configuration');
  const destination = new URL(path, API_ORIGIN);
  if (destination.origin !== API_ORIGIN || !destination.pathname.startsWith('/api/')) throw new ApiError('Invalid API destination', 0, 'configuration');
  const method = options.method || 'GET';
  const write = method !== 'GET';
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(destination.href, {
      method, credentials: 'include', signal: controller.signal,
      headers: { Accept: 'application/json', ...(write ? { 'Content-Type': 'application/json' } : {}) },
      ...(write ? { body: JSON.stringify(options.body ?? {}) } : {}),
    });
    // The OS cookie store handles HttpOnly Set-Cookie; passwords and cookies are never persisted in JS.
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { throw new ApiError('Unexpected response from server', response.status, 'invalid_response', write); }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const message = typeof detail.error === 'string' ? detail.error : typeof detail.message === 'string' ? detail.message : 'Request failed';
      throw new ApiError(message, response.status, errorCode(response.status), write && response.status >= 500, retrySeconds(response.headers.get('retry-after')), detail);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'Request cancelled or timed out' : 'Unable to connect to server', 0, controller.signal.aborted ? 'timeout' : 'network', write);
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
  }
}

const id = (value: Id) => {
  if (!/^[1-9]\d*$/.test(String(value))) throw new ApiError('Invalid resource ID', 400, 'validation');
  return encodeURIComponent(String(value));
};
const slug = (value: string) => encodeURIComponent(value);
const queryString = (query: Query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== null && value !== undefined) params.set(key, String(value)); });
  return params.size ? `?${params.toString()}` : '';
};
const post = <T = JsonRecord>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body });
const patch = <T = JsonRecord>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body });
const remove = <T = JsonRecord>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body });

export async function download(path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^\/api\/admin\/tournaments\/[1-9]\d*\/export\.xlsx$/.test(path)) throw new ApiError('Invalid export path', 400, 'validation');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(API_ORIGIN + path, { credentials: 'include', signal: controller.signal, headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    if (!response.ok) throw new ApiError('Export request failed', response.status, errorCode(response.status), false, retrySeconds(response.headers.get('retry-after')));
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) throw new ApiError('Unexpected export format', response.status, 'invalid_response');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, contentType };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to download export', 0, controller.signal.aborted ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
}

export const api = {
  request,
  download,
  me: () => request<Session>('/api/me'),
  login: (name: string, password: string) => post<Session>('/api/login', { name, password }),
  logout: () => post<{ ok: boolean }>('/api/logout'),
  register: (body: RegisterInput) => post<Session>('/api/register', body),
  recovery: (email: string, _locale: Locale = 'ru') => post<{ ok: boolean }>('/api/auth/password/forgot', { email }),
  updateProfile: (body: { name?: string; registerNickname?: string; telegramContact?: string; bcpEmail?: string; currentPassword?: string; newPassword?: string }) => patch<Session>('/api/me', body),
  emailConfig: () => request<JsonRecord>('/api/auth/email-config'),
  telegramStatus: () => request<JsonRecord>('/api/telegram/status'),
  tournaments: (query?: Query) => request<TournamentList>(`/api/tournaments${queryString(query)}`),
  tournament: (value: string) => request<TournamentDetail>(`/api/tournaments/${slug(value)}`),
  games: (query?: Query) => request<{ games: Game[]; pagination?: unknown }>(`/api/games${queryString(query)}`),
  game: (value: Id) => request<{ game: Game }>(`/api/games/${id(value)}`),
  gameByMatch: (value: Id) => request<{ game: Game }>(`/api/games/tournament-match/${id(value)}`),
  submitResult: (value: Id, body: ResultInput) => post<{ game: Game }>(`/api/games/${id(value)}/result`, body),
  confirmResult: (value: Id, expectedResultRevision?: string) => post<{ game: Game }>(`/api/games/${id(value)}/confirm-result`, { expectedResultRevision }),
  rejectResult: (value: Id, expectedResultRevision?: string) => post<{ game: Game }>(`/api/games/${id(value)}/reject-result`, { expectedResultRevision }),
  join: (value: Id, body: { faction?: string; factions?: string[]; factionRules?: string } = {}) => post<{ participant: Participant }>(`/api/tournaments/${id(value)}/join`, body),
  withdraw: (value: Id) => post<JsonRecord>(`/api/tournaments/${id(value)}/withdraw`),
  teams: (query?: Query) => request<{ teams: Team[] }>(`/api/teams${queryString(query)}`),
  team: (value: string) => request<JsonRecord>(`/api/teams/${slug(value)}`),
  teamDashboard: () => request<JsonRecord>('/api/teams/dashboard'),
  teamMembers: (value: Id) => request<JsonRecord>(`/api/teams/${id(value)}/members`),
  createTeam: (body: { name: string; description?: string }) => post<{ team: Team }>('/api/teams', body),
  inviteMember: (value: Id, userId: number) => post<JsonRecord>(`/api/teams/${id(value)}/invitations`, { userId }),
  respondToInvitation: (value: Id, action: 'accept' | 'decline' | 'revoke') => post<JsonRecord>(`/api/team-invitations/${id(value)}/${action}`),
  roster: (value: Id) => request<JsonRecord>(`/api/rosters/${id(value)}`),
  registerRoster: (value: Id, body: RosterInput) => post<JsonRecord>(`/api/tournaments/${id(value)}/rosters`, body),
  updateRoster: (tournamentId: Id, rosterId: Id, body: Partial<RosterInput>) => patch<JsonRecord>(`/api/tournaments/${id(tournamentId)}/rosters/${id(rosterId)}`, body),
  withdrawRoster: (tournamentId: Id, rosterId: Id) => post<JsonRecord>(`/api/tournaments/${id(tournamentId)}/rosters/${id(rosterId)}/withdraw`),
  pairing: (value: Id) => request<JsonRecord>(`/api/team-matches/${id(value)}`),
  pairingAction: (tournamentId: Id, matchId: Id, action: 'initiative' | 'manual' | 'roll' | 'undo' | 'ban' | 'shield' | 'sword' | 'environment', body: JsonRecord) => post<JsonRecord>(`/api/tournaments/${id(tournamentId)}/team-matches/${id(matchId)}/${action}`, body),
  notifications: () => request<Notifications>('/api/notifications'),
  setNotificationRead: (body: { id: string } | { through: string }) => post<JsonRecord>('/api/notifications/read', body),
  searchUsers: (q: string) => request<JsonRecord>(`/api/users/search${queryString({ q })}`),
  adminTournaments: (query?: Query) => request<TournamentList>(`/api/admin/tournaments${queryString(query)}`),
  adminTournament: (value: Id) => request<TournamentDetail>(`/api/admin/tournaments/${id(value)}`),
  createTournament: (body: JsonRecord) => post<JsonRecord>('/api/admin/tournaments', body),
  updateTournament: (value: Id, body: JsonRecord & { expectedUpdatedAt: string }) => patch<JsonRecord>(`/api/admin/tournaments/${id(value)}`, body),
  publishTournament: (value: Id, status: 'registration_open' | 'registration_closed') => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/publish`, { status }),
  registrationState: (value: Id, action: 'close' | 'reopen') => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/registration/${action}`),
  participantPayment: (tournamentId: Id, participantId: Id, paid: boolean) => patch<JsonRecord>(`/api/admin/tournaments/${id(tournamentId)}/participants/${id(participantId)}/payment`, { paid }),
  rosterPayment: (tournamentId: Id, rosterId: Id, paid: boolean) => patch<JsonRecord>(`/api/admin/tournaments/${id(tournamentId)}/rosters/${id(rosterId)}/payment`, { paid }),
  roundPreview: (value: Id) => request<JsonRecord>(`/api/admin/tournaments/${id(value)}/rounds/next/preview`),
  startTournament: (value: Id, body: JsonRecord) => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/start`, body),
  nextRound: (value: Id, body: JsonRecord) => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/rounds/next`, body),
  addTable: (value: Id, body: TableInput) => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/tables`, body),
  updateTable: (tournamentId: Id, tableId: Id, body: TableInput) => patch<JsonRecord>(`/api/admin/tournaments/${id(tournamentId)}/tables/${id(tableId)}`, body),
  staff: (value: Id) => request<JsonRecord>(`/api/admin/tournaments/${id(value)}/staff`),
  assignJudge: (value: Id, userId: number, expiresAt?: string) => post<JsonRecord>(`/api/admin/tournaments/${id(value)}/judges`, { userId, expiresAt }),
  revokeJudge: (tournamentId: Id, userId: Id) => remove<JsonRecord>(`/api/admin/tournaments/${id(tournamentId)}/judges/${id(userId)}`),
};

/** Image paths may be relative to the backend; do not allow arbitrary credential-bearing hosts. */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  try { const url = new URL(path, API_ORIGIN); return url.origin === API_ORIGIN && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
