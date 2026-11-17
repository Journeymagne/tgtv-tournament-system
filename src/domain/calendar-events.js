const { ValidationError } = require('../http/io');

function text(value, label, max, required = true) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new ValidationError(`${label} must contain ${required ? '1' : '0'} to ${max} characters`);
  }
  return value.trim();
}

function localDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('Invalid event date');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError('Invalid event date');
  return value;
}

function monthRange(value) {
  if (typeof value !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new ValidationError('Invalid calendar month');
  const [year, month] = value.split('-').map(Number);
  return { from: `${value}-01`, until: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01` };
}

function normalizeCalendarEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Invalid calendar event');
  const tournamentType = body.tournamentType;
  if (!['solo', 'teams', 'pairs'].includes(tournamentType)) throw new ValidationError('Invalid tournament type');
  const size = tournamentType === 'teams' ? 3 : tournamentType === 'pairs' ? 2 : 1;
  const participantLimit = Number(body.participantLimit);
  const max = size === 1 ? 10000 : 128 * size;
  if (!['number', 'string'].includes(typeof body.participantLimit) || !Number.isSafeInteger(participantLimit) || participantLimit < Math.max(2, size) || participantLimit > max) {
    throw new ValidationError(`Participant limit must be between ${Math.max(2,size)} and ${max}`);
  }
  const fee = String(body.entryFee ?? '').replace(',', '.');
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(fee) || Number(fee) > 1000000) throw new ValidationError('Entry fee must be between 0 and 1000000 with at most two decimal places');
  const time = body.time === '' || body.time == null ? null : body.time;
  if (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new ValidationError('Invalid event time');
  const city = text(body.city, 'City', 80), venue = text(body.venue, 'Venue', 160), address = text(body.address, 'Address', 300, false);
  if ([city,venue,address].filter(Boolean).join(', ').length > 500) throw new ValidationError('Combined venue address must not exceed 500 characters');
  return { name: text(body.name, 'Event name', 120), date: localDate(body.date), time, city,venue,address,tournamentType,participantLimit,entryFee:Number(fee) };
}

function tournamentDefaults(event) {
  const size = event.tournamentType === 'teams' ? 3 : event.tournamentType === 'pairs' ? 2 : 1;
  return {
    name: event.name, gameSystem: 'Warhammer 40k Kill Team', venueMode: 'irl',
    venueAddress: [event.city, event.venue, event.address].filter(Boolean).join(', '),
    // Browser supplies its local datetime as an ISO timestamp on submission.
    startsAt: `${event.date}T${event.time || '00:00'}`,
    participantMode: size === 1 ? 'individual' : 'team', format: 'swiss', teamSize: size === 1 ? null : size,
    pairingType: size === 2 ? 'doubles' : size === 3 ? 'shield_sword' : null,
    captainPairingEnabled: size === 2 ? false : true,
    registrationLimit: Math.floor(event.participantLimit / size)
  };
}

module.exports = { normalizeCalendarEvent, monthRange, tournamentDefaults };
