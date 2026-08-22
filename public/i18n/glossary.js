// Single source of truth for translation policy. Node-only: this file is never
// listed in index.html, and it requires from src/ so the term lists are read
// from where they already live instead of being copied by hand.
//
// Policy and rationale: docs/i18n-glossary.md
// Enforcement: test/unit/i18n.test.js

const { KILL_TEAMS, KILLZONES, CRIT_OPS } = require("../../src/domain/kill-teams");
const { tacOpOptions, gameSystemOptions, seasons } = require("../game-data.js");

// Rules terminology a player checks against the rulebook. Plural forms are
// listed explicitly: the word-boundary check treats "Tac Ops" and "Tac Op" as
// different terms.
const RULES_TERMS = [
  "Kill Team",
  "Kill Teams",
  "Approved Ops",
  "Crit Op",
  "Crit Ops",
  "Kill Op",
  "Kill Ops",
  "Tac Op",
  "Tac Ops",
  "Primary Op",
  "Primary Ops",
  "VP",
  "Killzone",
  "Killzones",
  "Dataslate",
  "Elo",
  "Strength of Schedule",
  "SoS"
];

// Product and feature names.
const PROPER_NAMES = [
  "Warhammer 40k Kill Team",
  "Tabletop Simulator",
  "All Kill Team Challenge",
  "Classified",
  "Non-Classified"
];

const PROTECTED = [
  ...new Set([
    ...RULES_TERMS,
    ...PROPER_NAMES,
    ...tacOpOptions,
    ...CRIT_OPS,
    ...KILLZONES,
    ...gameSystemOptions,
    ...seasons.map((season) => season.name),
    ...KILL_TEAMS
  ])
];

// Russian renderings that must never appear: each one is a protected term that
// somebody translated anyway.
const FORBIDDEN = [
  "килл тим",
  "килл-тим",
  "убойная команда",
  "очки победы",
  "крит оп",
  "критическая операция",
  "зона убийства"
];

// Keys whose Russian value is intentionally identical to the English one, with
// the reason. Anything not listed here and not made purely of protected terms
// fails check 7.
const SAME_IN_BOTH = {
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule stays English by decision.",
  "op.crit": "Rules term.",
  "op.kill": "Rules term.",
  "op.tac": "Rules term.",
  "venue.tts": "Product name.",
  "nav.challenge": "Feature name.",
  "auth.brand.title": "Product name.",
  "auth.field.telegramContactPlaceholder": "Placeholder format example, not localized text.",
  "games.filter.teamLabel": "Rules term.",
  "games.result.killzoneLabel": "Rules term.",
  "games.result.critOp": "Rules term.",
  "games.result.tiebreaker.tacCrit": "Rules term.",
  "games.result.withElo": "Rules term. (Elo, otherwise only placeholders and punctuation.)"
};

module.exports = { PROTECTED, RULES_TERMS, PROPER_NAMES, FORBIDDEN, SAME_IN_BOTH };
