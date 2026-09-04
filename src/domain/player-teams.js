const { ValidationError } = require("../http/io");
const { normalizeName, profileText } = require("./validation");

const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 80;
const TEAM_DESCRIPTION_MAX = 6000;
const TEAM_LOGO_MAX_BYTES = 1024 * 1024;
const TEAM_LOGO_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/i;

function normalizeTeamName(value) {
  const name = normalizeName(value);
  if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) {
    throw new ValidationError("Team name must be 2-80 characters");
  }
  return name;
}

function teamNameKey(value) {
  return normalizeTeamName(value).toLocaleLowerCase("en-US");
}

function normalizeTeamDescription(value) {
  return profileText(value, "Team description", TEAM_DESCRIPTION_MAX);
}

function normalizeTeamLogo(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("Team logo must be an image data URL");
  const match = value.match(TEAM_LOGO_PATTERN);
  if (!match) throw new ValidationError("Team logo must be a PNG, JPG, WebP, or GIF image");
  const padding = (match[2].match(/=*$/) || [""])[0].length;
  const byteLength = Math.floor((match[2].length * 3) / 4) - padding;
  if (byteLength > TEAM_LOGO_MAX_BYTES) throw new ValidationError("Team logo must be 1 MB or smaller");
  return value;
}

function normalizeRosterName(value) {
  const name = normalizeName(value);
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Roster name must be 2-80 characters");
  }
  return name;
}

module.exports = {
  TEAM_LOGO_MAX_BYTES,
  normalizeTeamName,
  teamNameKey,
  normalizeTeamDescription,
  normalizeTeamLogo,
  normalizeRosterName
};
