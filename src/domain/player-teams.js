const { ValidationError } = require("../http/io");
const { normalizeName, markdownText } = require("./validation");

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
  return markdownText(value, "Team description", TEAM_DESCRIPTION_MAX);
}

function normalizeTeamLogo(value, label = "Team logo") {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError(`${label} must be an image data URL`);
  const match = value.match(TEAM_LOGO_PATTERN);
  if (!match) throw new ValidationError(`${label} must be a PNG, JPG, WebP, or GIF image`);
  const padding = (match[2].match(/=*$/) || [""])[0].length;
  const byteLength = Math.floor((match[2].length * 3) / 4) - padding;
  if (byteLength > TEAM_LOGO_MAX_BYTES) throw new ValidationError(`${label} must be 1 MB or smaller`);
  return value;
}

function normalizeRosterName(value) {
  const name = normalizeName(value);
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Roster name must be 2-80 characters");
  }
  return name;
}

function defaultRosterName(team, rosters = []) {
  let number = rosters.filter((roster) => roster.teamId === team.id).length + 1;
  const used = new Set(rosters.map((roster) => normalizeName(roster.name).toLocaleLowerCase("en-US")));
  while (true) {
    const suffix = ` ${number}`;
    const name = `${normalizeName(team.name).slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(name.toLocaleLowerCase("en-US"))) return name;
    number += 1;
  }
}

module.exports = {
  TEAM_LOGO_MAX_BYTES,
  normalizeTeamName,
  teamNameKey,
  normalizeTeamDescription,
  normalizeTeamLogo,
  normalizeRosterName,
  defaultRosterName
};
