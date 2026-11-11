import { API_ORIGIN } from './client';
import type { Locale } from './types';

export interface NotificationCopy { title: string; body: string; route?: { name: string; params?: Record<string, string | number> }; websiteUrl?: string; actionLabel?: string }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const positiveId = (value: unknown): number | undefined => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

/** Mirrors the existing inbox event payloads; there is no server-generated title/body for most events. */
export function notificationCopy(item: Record<string, unknown>, locale: Locale): NotificationCopy {
  const t = (ru: string, en: string) => locale === 'ru' ? ru : en;
  const titles: Record<string, string> = {
    tournament_started: t('Турнир начался', 'Tournament started'),
    tournament_pairing: t('Ваша пара готова', 'Your pairing is ready'),
    team_tournament_pairing: t('Командная пара готова', 'Team pairing is ready'),
    team_invitation: t('Приглашение в команду', 'Team invitation'),
    game_challenge: t('Вызов на игру', 'Game challenge'),
    studio_review: t('Новый обзор команды', 'New team review'),
    studio_comment: t('Сообщение в обсуждении команды', 'New team discussion message'),
  };
  const kind = text(item.type);
  const tournament = object(item.tournament), team = object(item.team), actor = object(item.actor), opponent = object(item.opponent), table = object(item.table);
  const context = [text(tournament.name) || text(team.name) || text(item.teamName), text(item.authorName) || text(actor.name)];
  if (opponent.name) context.push(`${t('Соперник', 'Opponent')}: ${text(opponent.name)}`);
  if (item.roundNumber) context.push(`${t('Раунд', 'Round')} ${Number(item.roundNumber)}`);
  if (table.number) context.push(`${t('Стол', 'Table')} ${Number(table.number)}`);
  const mission = object(item.mission);
  if (mission.critOp) context.push(text(mission.critOp));
  if (item.excerpt) context.push(text(item.excerpt));
  const result: NotificationCopy = { title: text(item.title) || titles[kind] || 'KT Companion', body: text(item.body) || text(item.message) || context.filter(Boolean).join(' · ') };
  const gameId = positiveId(item.gameId);
  if (gameId && ['tournament_pairing', 'team_tournament_pairing'].includes(kind)) {
    result.route = { name: 'game', params: { id: gameId } }; result.actionLabel = t('Открыть игру', 'Open game');
  } else if (kind === 'tournament_started' && text(tournament.slug)) {
    result.route = { name: 'tournament', params: { slug: text(tournament.slug) } }; result.actionLabel = t('Открыть турнир', 'Open tournament');
  } else if (kind === 'team_invitation' && text(team.slug)) {
    result.route = { name: 'team', params: { slug: text(team.slug) } }; result.actionLabel = t('Открыть команду', 'Open team');
  } else if (text(item.href)) {
    try {
      const href = text(item.href);
      const url = new URL(href.startsWith('#/') ? '/tournament' + href : href, API_ORIGIN);
      if (url.origin === API_ORIGIN && !url.username && !url.password) { result.websiteUrl = url.href; result.actionLabel = t('Открыть на сайте', 'Open on website'); }
    } catch { /* A malformed external destination is not an app action. */ }
  }
  return result;
}
