const crypto = require('crypto');

// "TEST Bistro" -> "test-bistro". Lowercase, non-alphanumerics collapse to
// single hyphens, leading/trailing hyphens trimmed. Falls back to 'tenant'
// for names with no usable characters.
function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tenant';
}

// Appended on slug collision — 4 hex chars of randomness.
function randomSuffix() {
  return crypto.randomBytes(2).toString('hex');
}

// Generate a unique slug for a tenant name, retrying with a random suffix
// while the base (or suffixed) slug is already taken. `exists` is an async
// (slug) => boolean.
async function generateUniqueSlug(name, exists) {
  const base = slugify(name);
  let candidate = base;
  // Bounded retries — collisions on 4 random hex chars are vanishingly rare.
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await exists(candidate))) return candidate;
    candidate = `${base}-${randomSuffix()}`;
  }
  throw new Error('Could not generate a unique tenant slug');
}

module.exports = { slugify, generateUniqueSlug };
