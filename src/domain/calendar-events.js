const { ValidationError } = require('../http/io');

function calendarTimeZone(value) {
  if(value===undefined)return null;
  if(typeof value!=='string'||!value||value.length>100||/^[+-]/.test(value))throw new ValidationError('Invalid calendar time zone');
  try{return new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone;}
  catch{throw new ValidationError('Invalid calendar time zone');}
}

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

function normalizeCalendarEvent(body, {allowIncomplete=false} = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Invalid calendar event');
  const legacy = body.participantMode === undefined;
  if (legacy && !['solo','teams','pairs'].includes(body.tournamentType)) throw new ValidationError('Invalid tournament type');
  const participantMode = legacy ? (body.tournamentType==='solo'?'individual':'team') : body.participantMode;
  if (!['individual','team'].includes(participantMode)) throw new ValidationError('Invalid participant format');
  const rawSize = body.teamSize ?? (legacy ? (body.tournamentType==='pairs'?2:3) : null);
  if (participantMode==='team' && (!['number','string'].includes(typeof rawSize) || ![2,3].includes(Number(rawSize)))) throw new ValidationError('Team size must be 2 or 3');
  const size = participantMode==='team' ? Number(rawSize) : 1;
  const teamSize = participantMode==='team' ? size : null;
  const tournamentType = size===1?'solo':size===2?'pairs':'teams';
  const rawRounds = body.swissRoundCount===undefined ? 3 : body.swissRoundCount;
  const swissRoundCount = Number(rawRounds);
  if (!['number','string'].includes(typeof rawRounds) || !Number.isSafeInteger(swissRoundCount) || swissRoundCount<1 || swissRoundCount>2147483647) throw new ValidationError('Swiss round count must be a positive integer');
  const participantLimit = body.participantLimit==null||body.participantLimit===''?null:Number(body.participantLimit);
  const max = allowIncomplete?2147483647*size:size === 1 ? 10000 : 128 * size, min=allowIncomplete?size:Math.max(2,size);
  if (participantLimit!==null&&(!['number', 'string'].includes(typeof body.participantLimit) || !Number.isSafeInteger(participantLimit) || participantLimit < min || participantLimit > max)) {
    throw new ValidationError(`Participant limit must be between ${min} and ${max}`);
  }
  const fee = String(body.entryFee ?? '').replace(',', '.');
  if (fee!==''&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(fee) || Number(fee) > 1000000)) throw new ValidationError('Entry fee must be between 0 and 1000000 with at most two decimal places');
  const time = body.time === '' || body.time == null ? null : body.time;
  if (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new ValidationError('Invalid event time');
  const city = text(body.city, 'City', 80,!allowIncomplete), venue = text(body.venue, 'Venue', 160,!allowIncomplete), address = text(body.address, 'Address', allowIncomplete?500:300, false);
  if ([city,venue,address].filter(Boolean).join(', ').length > 500) throw new ValidationError('Combined venue address must not exceed 500 characters');
  return { name: text(body.name, 'Event name', 120,!allowIncomplete), date: localDate(body.date), time, city,venue,address,tournamentType,participantMode,teamSize,swissRoundCount,participantLimit,entryFee:fee===''?null:Number(fee) };
}

function tournamentDefaults(event) {
  const size = event.participantMode==='individual' ? 1 : event.teamSize || (event.tournamentType === 'teams' ? 3 : event.tournamentType === 'pairs' ? 2 : 1);
  return {
    providerId: event.providerId ?? null, name: event.name, gameSystem: 'Warhammer 40k Kill Team', venueMode: 'irl',
    venueAddress: [event.city, event.venue, event.address].filter(Boolean).join(', '),
    // A provider may have organizers in several time zones. The repository
    // resolves the announced wall time in the event's saved IANA zone.
    startsAt: event.providerId != null ? event.startsAt : `${event.date}T${event.time || '00:00'}`,
    participantMode: size === 1 ? 'individual' : 'team', format: 'swiss', swissRoundCount: event.swissRoundCount ?? 3,
    ...(size===1 ? {} : {teamSize:size}),
    pairingType: size === 2 ? 'doubles' : size === 3 ? 'shield_sword' : null,
    captainPairingEnabled: size === 2 ? false : true,
    registrationLimit: event.participantLimit==null ? null : Math.floor(event.participantLimit / size)
  };
}

module.exports = { normalizeCalendarEvent, monthRange, tournamentDefaults, calendarTimeZone };
