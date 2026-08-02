const { ValidationError } = require("../http/io");
const { MAX_AVATAR_DATA_URL_LENGTH } = require("../config");

const NAME_PATTERN = /^[\p{L}0-9 _.-]{2,24}$/u;
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function requireName(value) {
  const name = normalizeName(value);
  if (!NAME_PATTERN.test(name)) {
    throw new ValidationError("Name must be 2-24 characters: letters, numbers, spaces, ._-");
  }
  return name;
}

function profileText(value, label, maxLength) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function requiredProfileText(value, label, maxLength) {
  const text = profileText(value, label, maxLength);
  if (!text) throw new ValidationError(`${label} is required`);
  return text;
}

function validateAvatarData(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new ValidationError("Avatar must be an image data URL");
  }
  if (value.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new ValidationError("Avatar image is too large");
  }
  if (!AVATAR_PATTERN.test(value)) {
    throw new ValidationError("Avatar must be a PNG, JPG, WebP, or GIF image");
  }
  return value;
}

function requireInteger(value, { min, max, message }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(message);
  }
  return number;
}

function scoreInput(value) {
  return requireInteger(value, {
    min: 0,
    max: 6,
    message: "VP for each op must be between 0 and 6"
  });
}

function primaryInput(value) {
  if (!["crit", "kill", "tac"].includes(value)) {
    throw new ValidationError("Primary Op must be crit, kill, or tac");
  }
  return value;
}

function aplInput(value) {
  return requireInteger(value, {
    min: 0,
    max: 99,
    message: "APL on table must be an integer between 0 and 99"
  });
}

function optionalTextInput(value, label, maxLength = 80) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw new ValidationError(`${label} is too long`);
  return text;
}

module.exports = {
  normalizeName,
  requireName,
  profileText,
  requiredProfileText,
  validateAvatarData,
  requireInteger,
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput
};
