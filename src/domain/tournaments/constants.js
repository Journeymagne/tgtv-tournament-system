const TOURNAMENT_STATUSES = {
  DRAFT: "draft",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
};

const TOURNAMENT_FORMATS = {
  SINGLE_ELIMINATION: "single_elimination",
  SWISS: "swiss"
};

const PARTICIPANT_STATUSES = {
  JOINED: "joined",
  ACTIVE: "active",
  PENDING_PLACEMENT: "pending_placement",
  WITHDRAWN: "withdrawn",
  REMOVED: "removed",
  ELIMINATED: "eliminated",
  FINISHED: "finished"
};

const ROUND_STATUSES = {
  NOT_READY: "not_ready",
  ACTIVE: "active",
  COMPLETED: "completed"
};

const MATCH_STATUSES = {
  NOT_READY: "not_ready",
  ACTIVE: "active",
  PENDING_CONFIRMATION: "pending_confirmation",
  COMPLETED: "completed"
};

const RATING_POLICIES = ["ranked", "unranked"];
const CHALLENGE_CREDIT_POLICIES = ["count", "none"];
const SINGLE_ELIMINATION_SIZES = [8, 16, 32, 64];
const STANDINGS_TIEBREAKERS = [
  "strength_of_schedule",
  "buchholz",
  "head_to_head",
  "total_vp",
  "vp_diff"
];

module.exports = {
  TOURNAMENT_STATUSES,
  TOURNAMENT_FORMATS,
  PARTICIPANT_STATUSES,
  ROUND_STATUSES,
  MATCH_STATUSES,
  RATING_POLICIES,
  CHALLENGE_CREDIT_POLICIES,
  SINGLE_ELIMINATION_SIZES,
  STANDINGS_TIEBREAKERS
};
