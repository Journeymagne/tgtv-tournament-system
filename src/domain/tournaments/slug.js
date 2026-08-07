function baseSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tournament";
}

async function uniqueSlug(value, isTaken) {
  const base = baseSlug(value);
  let slug = base;
  let suffix = 2;
  while (await isTaken(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

module.exports = { baseSlug, uniqueSlug };
