const crypto = require("node:crypto");
const { HttpError, ValidationError } = require("../http/io");
const pairingWarnings = require("../../public/pairing-warnings");

// This is an advisory review for interactive clients, not a pairing prohibition.
// The transaction rolls back until the exact warnings have been acknowledged.
function reviewPairingWarnings(body = {}, proposed = [], history = [], venueMode = "tts") {
  if (body.reviewPairingWarnings !== true) return;
  const warnings = proposed.flatMap(match => pairingWarnings.warnings(match, history, venueMode));
  if (!warnings.length) return;
  const warningKey = crypto.createHash("sha256")
    .update(JSON.stringify({ proposed, warnings })).digest("hex");
  if (body.pairingWarningAcknowledgement === warningKey) return;
  const error = new HttpError(409, "Review pairing warnings before continuing");
  error.pairingWarningReview = { warnings, warningKey };
  throw error;
}

function assertUniquePhysicalTables(proposed = [], venueMode = "tts") {
  if (pairingWarnings.tableConflicts(proposed, venueMode).length) {
    throw new ValidationError("Each physical table can be assigned to only one pairing per round");
  }
}

module.exports = { ...pairingWarnings, reviewPairingWarnings, assertUniquePhysicalTables };
