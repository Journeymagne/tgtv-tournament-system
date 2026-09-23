const { ValidationError } = require('../http/io');

const PREFIXES = Object.freeze({ user: 'usr', tournamentParticipant: 'tpt', game: 'game', tournamentMatch: 'match' });

// Additive public references, never a numeric-ID allocator or an authorization check.
// Strings/bigints stay exact if the database later moves from SERIAL to BIGINT.
function publicId(entity, id) {
  const prefix = PREFIXES[entity];
  if (!prefix) throw new ValidationError('Unknown ID namespace');
  if (id == null) return null;
  if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^[1-9][0-9]*$/.test(String(id))) {
    throw new ValidationError('Invalid entity ID');
  }
  return `${prefix}_${id}`;
}

function parsePublicId(entity, value) {
  const prefix = PREFIXES[entity];
  if (!prefix || typeof value !== 'string' || !value.startsWith(`${prefix}_`)) {
    throw new ValidationError('Wrong ID namespace');
  }
  const id = value.slice(prefix.length + 1);
  if (publicId(entity, id) !== value) throw new ValidationError('Invalid public ID');
  return id;
}

module.exports = { publicId, parsePublicId };
