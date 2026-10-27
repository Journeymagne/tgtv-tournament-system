const MiB = 1024 * 1024;
// Business quotas can be increased per account. Transport/CPU limits are separate.
const definitions = {
  sessions: [10, 'Активные сессии', 'Active sessions'],
  loginMinute: [5, 'Успешные входы / минуту', 'Successful logins / minute'],
  loginHour: [30, 'Успешные входы / час', 'Successful logins / hour'],
  studioProjects: [50, 'Проекты Studio', 'Studio projects'],
  studioStorageBytes: [1024 * MiB, 'Studio: общий объём', 'Studio: total storage', 'bytes'],
  ttsStorageBytes: [512 * MiB, 'TTS: объём внутри квоты Studio', 'TTS: storage within Studio quota', 'bytes'],
  ttsVersions: [20, 'Экспорты TTS на проект', 'TTS exports per project'],
  studioCreateDay: [10, 'Новые проекты Studio / сутки', 'New Studio projects / day'],
  studioPublishHour: [10, 'Публикации Studio / час', 'Studio publications / hour'],
  studioSaveMinute: [30, 'Сохранения Studio / минуту', 'Studio saves / minute'],
  studioSaveHour: [600, 'Сохранения Studio / час', 'Studio saves / hour'],
  ttsExportHour: [10, 'Экспорты TTS / час', 'TTS exports / hour'],
  teamsActive: [5, 'Команды под руководством', 'Teams led'],
  teamsCreateDay: [2, 'Новые игровые команды / сутки', 'New player teams / day'],
  inviteDay: [20, 'Приглашения / сутки', 'Invitations / day'],
  inviteRecipientDay: [3, 'Приглашения одному игроку / сутки', 'Invitations per recipient / day'],
  challengeDay: [20, 'Вызовы / сутки', 'Challenges / day'],
  challengeRecipientDay: [3, 'Вызовы одному игроку / сутки', 'Challenges per recipient / day'],
  challengeActive: [10, 'Ожидающие исходящие вызовы', 'Pending outgoing challenges'],
  tournamentsActive: [10, 'Незавершённые турниры', 'Unfinished tournaments'],
  tournamentsCreateDay: [2, 'Новые турниры / сутки', 'New tournaments / day'],
  tournamentParticipants: [256, 'Участники индивидуального Swiss', 'Individual Swiss participants'],
  tournamentRounds: [20, 'Раунды Swiss', 'Swiss rounds'],
  tournamentBulk: [100, 'Участники за один импорт', 'Participants per import'],
  tournamentTables: [256, 'Столы на турнир', 'Tables per tournament'],
  feedbackDay: [3, 'Обращения / сутки', 'Feedback / day'],
  feedbackOpen: [10, 'Открытые обращения', 'Open feedback'],
  trainingHour: [10, 'Новые тренировки / час', 'New training sessions / hour'],
  trainingDay: [50, 'Новые тренировки / сутки', 'New training sessions / day'],
  faqCreateDay: [20, 'Новые карточки FAQ / сутки', 'New FAQ entries / day'],
  achievementCreateDay: [20, 'Новые достижения / сутки', 'New achievements / day'],
  contentEditHour: [60, 'Правки FAQ и достижений / час', 'FAQ and achievement edits / hour']
};
const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, value[0]])));
const CATALOG = Object.freeze(Object.entries(definitions).map(([key, [value, ru, en, unit = 'count']]) => ({
  key, default: value, max: unit === 'bytes' ? 32 * 1024 * MiB : Math.min(value * 100, 100000), ru, en, unit
})));
function validateOverrides(input) {
  const { ValidationError } = require('../http/io');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Укажите объект индивидуальных квот.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const rule = CATALOG.find(item => item.key === key);
    if (!rule || !Number.isSafeInteger(value) || value < rule.default || value > rule.max) {
      throw new ValidationError(`Некорректная квота ${key}. Разрешены только конечные значения не ниже стандартного лимита.`);
    }
    if (value !== rule.default) result[key] = value;
  }
  const effective = { ...DEFAULTS, ...result };
  if (effective.ttsStorageBytes > effective.studioStorageBytes) throw new ValidationError('Объём TTS не может превышать общую квоту Studio.');
  return result;
}
module.exports = { MiB, DEFAULTS, CATALOG, validateOverrides };
