const { contentVersion } = require("./data-url");

function logoUrl(kind, id, data) {
  if (!data) return null;
  return `/api/${kind}-logos/${id}?v=${contentVersion(data)}`;
}

function teamLogoView(team) {
  return team ? { ...team, logoData: logoUrl("team", team.id, team.logoData) } : team;
}

module.exports = { logoUrl, teamLogoView };
