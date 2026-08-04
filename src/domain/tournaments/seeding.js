const { ValidationError } = require("../../http/io");

function competitiveParticipants(participants) {
  return participants
    .filter((participant) => ["joined", "active"].includes(participant.status))
    .sort((a, b) => (a.seed || 0) - (b.seed || 0) || a.id - b.id);
}

function validateSeedOrder(participants) {
  const active = competitiveParticipants(participants);
  const seeds = new Set();
  for (const participant of active) {
    if (!Number.isInteger(participant.seed) || participant.seed < 1) {
      throw new ValidationError("Every active participant must have a seed");
    }
    if (seeds.has(participant.seed)) throw new ValidationError("Seeds must be unique");
    seeds.add(participant.seed);
  }
  for (let index = 1; index <= active.length; index += 1) {
    if (!seeds.has(index)) throw new ValidationError("Seeds must be contiguous");
  }
  return active;
}

function seedParticipants(participants) {
  return [...participants].sort((a, b) => a.seed - b.seed || a.id - b.id);
}

function shuffledIds(ids, random = Math.random) {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

module.exports = {
  competitiveParticipants,
  validateSeedOrder,
  seedParticipants,
  shuffledIds
};
