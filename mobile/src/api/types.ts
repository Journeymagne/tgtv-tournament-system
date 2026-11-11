/** Existing HTTP contracts. IDs retain the server namespace: game ≠ match ≠ participant. */
export type Id = number | string;
export type Locale = 'ru' | 'en';
export type JsonRecord = Record<string, unknown>;
export interface User {
  id: number; name: string; avatarUrl?: string | null; registerNickname?: string;
  telegramContact?: string; bcpEmail?: string; rating?: number;
  ratings?: { tts: number; irl: number; combined: number };
  isAdmin?: boolean; isSuperAdmin?: boolean; canCreateTournaments?: boolean;
  capabilities?: Record<string, boolean>; managedTournamentIds?: number[];
  emailAccount?: JsonRecord;
}
export interface GamePlayer extends User { userId?: number | null; isProxy?: boolean; faction?: string; factions?: string[]; hasProfile?: boolean; tournamentParticipantId?: number | null }
export interface ScoreInput { crit: number; kill: number; tac: number; primary: 'crit' | 'kill' | 'tac'; faction?: string; tacOp?: string }
export interface Score extends ScoreInput { total: number; primaryBonus: number; primaryScore?: number }
export interface Mission { killzone?: string; critOp?: string; layout?: number | null }
export interface ResultInput {
  scores: Record<string, ScoreInput>;
  expectedResultRevision?: string;
  killzone?: Mission | null;
  tiebreakers?: { enabled: boolean; apl?: Record<string, number>; rollOffWinnerId?: number | null };
}
export interface Result { scores: Record<string, Score>; winnerId?: number | null; killzone?: Mission | null; tiebreakers?: JsonRecord | null }
export interface Game {
  id: number; status: string; playerIds: number[]; players: GamePlayer[];
  resultRevision?: string;
  sourceType?: string; sourceId?: number; venueMode?: string;
  result?: Result | null; pendingResult?: { submittedBy: number; submittedAt?: string; result: Result } | null;
  submittedBy?: number | null; tournament?: Tournament; roundNumber?: number;
  table?: Table | null; mission?: Mission | null; resultPermissions?: Record<string, boolean>;
  tournamentMatch?: Match; teamMatch?: JsonRecord; createdAt?: string; completedAt?: string | null;
}
export interface Session { user: User | null; hasAdmin?: boolean; games?: Game[]; teamPairings?: JsonRecord[]; challenges?: JsonRecord[] }
export interface RegisterInput { name: string; password: string; confirmPassword: string; telegramContact: string; registerNickname?: string; email?: string; locale?: Locale }
export interface TournamentViewer { canAdmin?: boolean; canManage?: boolean; canJoin?: boolean; canWithdraw?: boolean; participantId?: number | null; [key: string]: unknown }
export interface Tournament {
  id: number; slug: string; name: string; status: string; participantMode?: 'individual' | 'team';
  format?: string; venueMode?: string; venueAddress?: string; startsAt?: string | null;
  description?: string; rulesLink?: string; rulesUrl?: string; rulesType?: string;
  participantCount?: number; maxParticipants?: number | null; roundCount?: number;
  pairingType?: string; updatedAt?: string; viewer?: TournamentViewer;
  [key: string]: unknown;
}
export interface Participant {
  id: number; userId?: number | null; displayName: string; user?: User | null;
  faction?: string; factions?: string[]; factionHidden?: boolean; factionRules?: string;
  status?: string; paid?: boolean; seed?: number; isProxy?: boolean;
}
export interface Table { id: number; tableNumber: number; killzone?: string; deployment?: number | null; imageUrl?: string | null }
export interface Match {
  id: number; gameId?: number | null; tournamentId?: number; roundId?: number; roundNumber?: number;
  status: string; isBye?: boolean; participantAId?: number | null; participantBId?: number | null;
  participantA?: Participant | null; participantB?: Participant | null; table?: Table | null;
  mission?: Mission | null; result?: Result | null;
}
export interface Round { id: number; roundNumber: number; status: string; matches: Match[]; startedAt?: string; completedAt?: string; metadata?: JsonRecord }
export interface Standing {
  rank: number; participantId?: number; rosterId?: number; wins: number; draws: number; losses: number;
  matchPoints?: number; totalVp?: number; vpDiff?: number; strengthOfSchedule?: number;
  [key: string]: unknown;
}
export interface TournamentDetail {
  tournament: Tournament; participants: Participant[]; tables: Table[]; rounds: Round[];
  standings: Standing[]; tournamentGames?: Game[]; rosters?: JsonRecord[]; teamMatches?: JsonRecord[];
  finalResults?: unknown; auditEvents?: JsonRecord[]; staff?: JsonRecord;
}
export interface Pagination { page: number; pageSize?: number; total?: number; totalPages?: number; [key: string]: unknown }
export interface TournamentList { tournaments: Tournament[]; pagination?: Pagination }
export interface Team { id: number; slug: string; name: string; description?: string; logoUrl?: string | null; leaderUserId?: number; [key: string]: unknown }
export interface Notification { id: string; type?: string; title?: string; body?: string; message?: string; href?: string; url?: string; createdAt: string; unread: boolean; [key: string]: unknown }
export interface Notifications { items: Notification[]; unreadCount: number; generatedAt: string; lastSeenAt: string | null }
export interface RosterInput { teamId: number; name?: string; captainUserId: number; members: Array<{ userId: number; faction?: string; factions?: string[] }> }
export interface TableInput { tableNumber: number; killzone?: string; deployment?: number | null }
