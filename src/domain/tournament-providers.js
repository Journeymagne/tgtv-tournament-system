const { ValidationError } = require('../http/io');
const { isPlatformAdmin } = require('./access');
const { decodeDataUrl } = require('./data-url');
const { normalizeTeamLogo } = require('./player-teams');
const { markdownText, normalizeName, requiredProfileText } = require('./validation');

function normalizeProvider(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Provider profile must be an object');
  }

  const profile = {};
  const includes = field => !partial || Object.hasOwn(input, field);
  if (includes('name')) {
    const name = typeof input.name === 'string' ? normalizeName(input.name) : '';
    const nameLength = Array.from(name).length;
    if (nameLength < 2 || nameLength > 80 || name.includes('\0')) {
      throw new ValidationError('Provider name must be 2-80 characters');
    }
    profile.name = name;
    profile.nameKey = name.toLocaleLowerCase('en-US');
  }
  if (includes('city')) {
    const city = typeof input.city === 'string' ? input.city : '';
    if (city.includes('\0')) throw new ValidationError('Provider city must be text');
    profile.city = requiredProfileText(city, 'Provider city', 80);
  }
  if (includes('logoData')) {
    const logoData = normalizeTeamLogo(input.logoData, 'Provider logo');
    if (!logoData) throw new ValidationError('Provider logo is required');
    if (!decodeDataUrl(logoData)) throw new ValidationError('Invalid provider logo');
    profile.logoData = logoData;
  }
  if (includes('description')) {
    if (input.description != null && (typeof input.description !== 'string' || input.description.includes('\0'))) {
      throw new ValidationError('Provider description must be text');
    }
    profile.description = markdownText(input.description, 'Provider description', 6000);
  }
  return profile;
}

function providerPermissions(user, provider, membership) {
  const isMember = Boolean(user && provider && membership && membership.userId === user.id &&
    membership.providerId === provider.id && !membership.endedAt);
  const organizer = isMember && membership.role === 'organizer';
  const isOwner = organizer && provider.ownerUserId === user.id;
  const admin = Boolean(provider && isPlatformAdmin(user));
  const manageMembers = admin || isOwner;
  const active = Boolean(provider && !provider.archivedAt);

  return {
    canEdit: manageMembers || (active && organizer),
    canCreateEvents: active && (admin || organizer),
    canManageMembers: manageMembers,
    canTransferOwnership: manageMembers,
    canArchive: active && manageMembers,
    canRestore: Boolean(provider?.archivedAt && manageMembers),
    isMember,
    isOwner
  };
}

function providerLogoUrl(id, version) {
  return id && version ? `/api/tournament-provider-logos/${id}?v=${version}` : null;
}

module.exports = { normalizeProvider, providerPermissions, providerLogoUrl };
